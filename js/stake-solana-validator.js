/**
 * New Mindfolk website — stake-solana.html
 * RPC snapshot + stake distribution (replaces former validator-stats.js).
 * Edit VALIDATOR_BRANDING / KNOWN_WITHDRAWERS here.
 */
(function () {
  const VOTE_PUBKEY = 'MFLKX9vSfWXa4ZcVVpp4GF64ZbNUiX9EjSqtqNMdFXB';
  const STAKE_PROGRAM_ID = 'Stake11111111111111111111111111111111111111';
  /** Byte offset of delegation.voter_pubkey in active stake account layout (mainnet). */
  const STAKE_VOTER_PUBKEY_OFFSET = 124;

  /**
   * Shown in the header. Location / description / client are not available from JSON-RPC;
   * update here when they change. Jito client version is self-reported (gossip/indexers), not a standard RPC field.
   */
  const VALIDATOR_BRANDING = {
    displayName: 'The Mindfolk',
    location: 'Brazil, São Paulo',
    /** City line (JPool-style); can mirror location. */
    city: 'São Paulo',
    description: 'Mindfolk is the Solana OG NFT art collection by Jurgens Walt',
    clientLine: 'Jito v3.1.10',
    /** Optional illustrative MEV tip yield (e.g. from dashboards); 0 to hide the extra line. */
    jitoTipsApyPercent: 0.1,
    /** Shown next to RPC commission; inflation commission is the vote %, Jito row is operational detail. */
    commissionDetail: '5% + 10% Jito',
    /**
     * Paste from JPool / dashboards — not available on vanilla JSON-RPC.
     * Leave blank string to show an em dash.
     */
    indexerStats: {
      /** Paste from JPool / dashboards; trend chevrons are decorative (not live RPC). */
      timelyVoteRate: '98.19%',
      timelyVoteTrend: 'down',
      tvcRank: '140',
      tvcRankTrend: 'up',
      uptime: '98.42%',
      bondHealth: '100.0%',
    },
  };

  /** Set in loadSnapshot; used by loadDistribution for activating stake. */
  let lastEpochNumber = -1;

  const SLOT_MS_EST = 400;

  /**
   * Known withdrawer authorities → display labels (extend as needed).
   * Unlisted withdrawers appear as shortened addresses.
   */
  const KNOWN_WITHDRAWERS = {
    '4ZJhPQAgUseCsWhKvJLTmmRRUV74fdoTpQLNfKoekbPY': 'SFDP',
    Hodkwm8xf43JzRuKNYPGnYJ7V9cXZ7LJGNy96TWQiSGN: 'Jag Pool',
    '4cpnpiwgBfUgELVwNYiecwGti45YHSH3R72CPkFTiwJt': 'Double Zero',
    HbJTxftxnXgpePCshA8FubsRj9MW4kfPscfuUfn44fnt: 'JPool',
    GdNXJobf8fbTR5JSE7adxa6niaygjx4EEbnnRaDCHMMW: 'Vault',
    // Tiny delegations observed on this vote account (verify before reusing elsewhere).
    '6WecYymEARvjG5ZyqkrVQ6YkhPfujNzWpSPwNKXHCbV2': 'BlazeStake',
    '6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS': 'Jito',
  };

  const CHART_COLORS = [
    'rgba(38, 166, 154, 0.9)',
    'rgba(255, 138, 101, 0.9)',
    'rgba(141, 110, 99, 0.9)',
    'rgba(255, 213, 79, 0.9)',
    'rgba(100, 181, 246, 0.9)',
    'rgba(206, 147, 216, 0.9)',
    'rgba(129, 199, 132, 0.9)',
    'rgba(255, 183, 77, 0.9)',
    'rgba(77, 208, 225, 0.9)',
    'rgba(239, 83, 80, 0.9)',
    'rgba(189, 189, 189, 0.85)',
  ];

  let distributionChart = null;
  let refreshTimer = null;

  /** Optional: set via window.CONFIG.HELIUS_API_KEY or localStorage('helius_api_key'). */
  const DEFAULT_HELIUS_API_KEY = '';

  function heliusRpcUrl() {
    const key =
      (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.HELIUS_API_KEY) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('helius_api_key')) ||
      DEFAULT_HELIUS_API_KEY;
    const trimmed = (key || '').trim();
    if (trimmed) return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(trimmed)}`;
    return null;
  }

  function rpcEndpoints() {
    const list = [];
    const h = heliusRpcUrl();
    if (h) list.push(h);
    list.push('https://api.mainnet-beta.solana.com');


    return list;
  }

  async function rpcCall(endpoint, method, params) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    return j.result;
  }

  async function rpcWithFallback(method, params) {
    let lastErr;
    for (const url of rpcEndpoints()) {
      try {
        return { result: await rpcCall(url, method, params), endpoint: url };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('RPC failed');
  }

  function formatSol(lamports) {
    const n = Number(lamports) / 1e9;
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 });
  }

  function shortenPk(pk) {
    if (!pk || pk.length < 12) return pk || '—';
    return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
  }

  function labelForWithdrawer(w) {
    if (KNOWN_WITHDRAWERS[w]) return KNOWN_WITHDRAWERS[w];
    return `Stake ${shortenPk(w)}`;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /** Decorative chevrons for indexer-sourced stats (matches dashboard-style tiles). */
  function applyTrendIcon(elementId, direction) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.remove('validator-stat-trend--down', 'validator-stat-trend--up', 'd-none');
    if (direction === 'down') {
      el.classList.add('validator-stat-trend--down');
      el.replaceChildren();
      const i = document.createElement('i');
      i.className = 'fa-solid fa-chevron-down';
      i.setAttribute('aria-hidden', 'true');
      el.appendChild(i);
    } else if (direction === 'up') {
      el.classList.add('validator-stat-trend--up');
      el.replaceChildren();
      const i = document.createElement('i');
      i.className = 'fa-solid fa-chevron-up';
      i.setAttribute('aria-hidden', 'true');
      el.appendChild(i);
    } else {
      el.classList.add('d-none');
      el.replaceChildren();
    }
  }

  function setStatus(msg, isError) {
    const el = document.getElementById('validatorStakeStatus');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
  }

  function applyBranding() {
    setText('vsDisplayName', VALIDATOR_BRANDING.displayName);
    setText('vsLocation', VALIDATOR_BRANDING.location);
    setText('vsCity', VALIDATOR_BRANDING.city || '—');
    setText('vsDescription', VALIDATOR_BRANDING.description);
    setText('vsClientLine', VALIDATOR_BRANDING.clientLine);
    const idx = VALIDATOR_BRANDING.indexerStats || {};
    setText('vsTimelyVoteRate', idx.timelyVoteRate ? String(idx.timelyVoteRate) : '—');
    setText('vsTvcRank', idx.tvcRank ? String(idx.tvcRank) : '—');
    setText('vsUptime', idx.uptime ? String(idx.uptime) : '—');
    setText('vsBondHealth', idx.bondHealth ? String(idx.bondHealth) : '—');
    applyTrendIcon('vsTimelyVoteTrendIcon', idx.timelyVoteTrend || '');
    applyTrendIcon('vsTvcRankTrendIcon', idx.tvcRankTrend || '');
    const commRow = document.getElementById('vsCommissionDetailRow');
    if (VALIDATOR_BRANDING.commissionDetail) {
      setText('vsCommissionDetail', VALIDATOR_BRANDING.commissionDetail);
      if (commRow) commRow.classList.remove('d-none');
    } else if (commRow) commRow.classList.add('d-none');
    setText('vsCommissionJito', VALIDATOR_BRANDING.commissionDetail || '—');
  }

  function formatDurationMs(ms) {
    if (ms <= 0 || !Number.isFinite(ms)) return '—';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  /** Inflation-based staking yield ≈ (annual inflation fraction × total supply) / total activated stake. */
  function estimateStakingApyFraction(inflationTotal, totalSupplyLamports, totalActivatedStakeLamports) {
    const inf = Number(inflationTotal);
    const supply = Number(totalSupplyLamports);
    const staked = Number(totalActivatedStakeLamports);
    if (!inf || !supply || !staked) return null;
    return (inf * supply) / staked;
  }

  function wireCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach((btn) => {
      if (btn.dataset.copyBound) return;
      btn.dataset.copyBound = '1';
      btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-copy');
        if (!t) return;
        const labelDefault = btn.getAttribute('aria-label') || 'Copy address';
        const icon = btn.querySelector('i');
        const prevIconClass = icon ? icon.className : '';
        navigator.clipboard.writeText(t).then(
          () => {
            btn.setAttribute('aria-label', 'Copied');
            if (icon) icon.className = 'fa-solid fa-check';
            window.setTimeout(() => {
              if (icon) icon.className = prevIconClass;
              btn.setAttribute('aria-label', labelDefault);
            }, 1400);
          },
          () => {}
        );
      });
    });
  }

  function setHref(id, url) {
    const el = document.getElementById(id);
    if (el) el.href = url;
  }

  async function loadSnapshot() {
    const voteRes = (await rpcWithFallback('getVoteAccounts', [{ votePubkey: VOTE_PUBKEY }])).result;
    const current = (voteRes.current && voteRes.current[0]) || null;
    const delinquent = (voteRes.delinquent && voteRes.delinquent[0]) || null;
    const va = current || delinquent;
    if (!va) {
      setText('vsActivatedStake', '—');
      setText('vsCommission', '—');
      setStatus('Vote account not found in current or delinquent set.', true);
      throw new Error('Vote account not found.');
    }

    const identityPubkey = va.nodePubkey;
    const votePubkey = va.votePubkey || VOTE_PUBKEY;

    const [epochWrap, inflationWrap, supplyWrap, idBalWrap, voteBalWrap] = await Promise.all([
      rpcWithFallback('getEpochInfo', []),
      rpcWithFallback('getInflationRate', []),
      rpcWithFallback('getSupply', []),
      rpcWithFallback('getBalance', [identityPubkey]),
      rpcWithFallback('getBalance', [votePubkey]),
    ]);

    let allVote = { current: [], delinquent: [] };
    try {
      allVote = (await rpcWithFallback('getVoteAccounts', [{}])).result;
    } catch (e) {
      console.warn('getVoteAccounts (all) failed; APY estimate unavailable:', e);
    }

    const epochInfo = epochWrap.result;
    const inflation = inflationWrap.result;
    const supply = supplyWrap.result.value;
    const idLamports = idBalWrap.result.value;
    const voteLamports = voteBalWrap.result.value;
    lastEpochNumber = Number(epochInfo.epoch);
    if (!Number.isFinite(lastEpochNumber)) lastEpochNumber = -1;

    let totalActivatedStake = 0;
    for (const v of allVote.current || []) totalActivatedStake += Number(v.activatedStake) || 0;
    for (const v of allVote.delinquent || []) totalActivatedStake += Number(v.activatedStake) || 0;

    const grossApyFrac =
      totalActivatedStake > 0
        ? estimateStakingApyFraction(inflation.total, supply.total, totalActivatedStake)
        : null;
    const commissionPct = Number(va.commission) || 0;
    const netApyFrac = grossApyFrac != null ? grossApyFrac * (1 - commissionPct / 100) : null;
    const jitoTip = Number(VALIDATOR_BRANDING.jitoTipsApyPercent) || 0;
    const totalApyFrac =
      grossApyFrac != null && jitoTip > 0 ? grossApyFrac + jitoTip / 100 : grossApyFrac;

    setText('vsIdentityPub', identityPubkey);
    setText('vsVotePub', votePubkey);
    setText('vsIdentityShort', shortenPk(identityPubkey));
    setText('vsVoteShort', shortenPk(votePubkey));
    setHref('vsIdentitySolscan', `https://solscan.io/account/${identityPubkey}`);
    setHref('vsVoteSolscan', `https://solscan.io/account/${votePubkey}`);
    setHref('vsSolscanVoteFallback', `https://solscan.io/account/${votePubkey}`);
    setHref('vsJpoolFallback', `https://app.jpool.one/validators/${votePubkey}`);

    const copyId = document.getElementById('vsCopyIdentity');
    const copyVote = document.getElementById('vsCopyVote');
    if (copyId) copyId.setAttribute('data-copy', identityPubkey);
    if (copyVote) copyVote.setAttribute('data-copy', votePubkey);
    wireCopyButtons();

    setText('vsIdentityBalance', `${formatSol(idLamports)} SOL`);
    setText('vsVoteBalance', `${formatSol(voteLamports)} SOL`);

    if (grossApyFrac != null) {
      setText('vsApyStakingGross', `${(grossApyFrac * 100).toFixed(2)}%`);
      setText(
        'vsApyAfterCommission',
        netApyFrac != null ? `${(netApyFrac * 100).toFixed(2)}%` : '—'
      );
      if (jitoTip > 0) {
        setText(
          'vsApyStakingPlusJito',
          `${(grossApyFrac * 100).toFixed(2)}% + ${jitoTip.toFixed(2)}%`
        );
        setText('vsApyJitoTips', `+ ${jitoTip.toFixed(2)}%`);
        setText('vsApyTotal', `${((totalApyFrac || 0) * 100).toFixed(2)}%`);
        const jitoRow = document.getElementById('vsApyJitoRow');
        const totalRow = document.getElementById('vsApyTotalRow');
        const apyComboRow = document.getElementById('vsApyComboRow');
        if (apyComboRow) apyComboRow.classList.remove('d-none');
        if (jitoRow) jitoRow.classList.remove('d-none');
        if (totalRow) totalRow.classList.remove('d-none');
      } else {
        setText('vsApyStakingPlusJito', `${(grossApyFrac * 100).toFixed(2)}%`);
        setText(
          'vsApyTotal',
          netApyFrac != null ? `${(netApyFrac * 100).toFixed(2)}%` : '—'
        );
        const apyComboRow = document.getElementById('vsApyComboRow');
        if (apyComboRow) apyComboRow.classList.add('d-none');
        const jitoRow = document.getElementById('vsApyJitoRow');
        const totalRow = document.getElementById('vsApyTotalRow');
        if (jitoRow) jitoRow.classList.add('d-none');
        if (totalRow) totalRow.classList.add('d-none');
      }
    } else {
      setText('vsApyStakingGross', '—');
      setText('vsApyAfterCommission', '—');
      setText('vsApyStakingPlusJito', '—');
      setText('vsApyTotal', '—');
      const apyComboRow = document.getElementById('vsApyComboRow');
      if (apyComboRow) apyComboRow.classList.add('d-none');
      const jitoRow = document.getElementById('vsApyJitoRow');
      const totalRow = document.getElementById('vsApyTotalRow');
      if (jitoRow) jitoRow.classList.add('d-none');
      if (totalRow) totalRow.classList.add('d-none');
    }

    setText('vsActivatedStake', `${formatSol(va.activatedStake)} SOL`);
    setText('vsCommission', `${va.commission}%`);
    if (!VALIDATOR_BRANDING.commissionDetail) {
      setText('vsCommissionJito', `${va.commission}%`);
    }
    setText('vsLastVote', String(va.lastVote));
    setText('vsRootSlot', va.rootSlot != null ? String(va.rootSlot) : '—');
    setText('vsEpochVoteAccount', va.epochVoteAccount === true ? 'Yes' : va.epochVoteAccount === false ? 'No' : '—');
    setText('vsEpoch', String(epochInfo.epoch));

    const slotsInEpoch = Math.max(1, epochInfo.slotsInEpoch || 1);
    const slotIndex = epochInfo.slotIndex || 0;
    const pct = Math.min(100, Math.max(0, (100 * slotIndex) / slotsInEpoch));
    setText('vsEpochSlots', `${slotIndex.toLocaleString()} / ${slotsInEpoch.toLocaleString()}`);
    setText('vsEpochPct', `${pct.toFixed(1)}%`);
    const slotsLeft = Math.max(0, slotsInEpoch - slotIndex);
    setText('vsEpochCountdown', formatDurationMs(slotsLeft * SLOT_MS_EST));
    const bar = document.getElementById('vsEpochBar');
    if (bar) bar.style.width = `${pct}%`;

    const credits = va.epochCredits || [];
    const lastCredit = credits.length ? credits[credits.length - 1] : null;
    if (lastCredit) {
      setText('vsEpochCredits', `Epoch ${lastCredit[0]} · ${Number(lastCredit[1]).toLocaleString()} credits`);
    } else {
      setText('vsEpochCredits', '—');
    }

    setStatus(
      delinquent && !current
        ? 'Validator is currently in the delinquent set (snapshot still shown).'
        : 'Data loaded directly from Solana RPC.',
      !!delinquent && !current
    );
  }

  /** Activating stake: activationEpoch > current epoch. */
  function sumActivatingStake(accounts, currentEpoch) {
    let activating = 0;
    if (!Number.isFinite(currentEpoch) || currentEpoch < 0) return activating;
    for (const row of accounts) {
      const parsed = row.account && row.account.data && row.account.data.parsed;
      if (!parsed || parsed.type !== 'delegated') continue;
      const info = parsed.info;
      const del = info.stake && info.stake.delegation;
      if (!del || del.voter !== VOTE_PUBKEY) continue;
      const lam = Number(del.stake) || 0;
      const actEp = Number(del.activationEpoch);
      if (Number.isFinite(actEp) && actEp > currentEpoch) activating += lam;
    }
    return activating;
  }

  function aggregateByWithdrawer(accounts) {
    const map = new Map();
    for (const row of accounts) {
      const acc = row.account;
      const parsed = acc && acc.data && acc.data.parsed;
      if (!parsed || parsed.type !== 'delegated') continue;
      const info = parsed.info;
      const del = info.stake && info.stake.delegation;
      if (!del || del.voter !== VOTE_PUBKEY) continue;
      const w = info.meta && info.meta.authorized && info.meta.authorized.withdrawer;
      if (!w) continue;
      const lamports = Number(del.stake) || 0;
      map.set(w, (map.get(w) || 0) + lamports);
    }
    return map;
  }

  /** Labels like `Stake abcd…wxyz` (unknown withdrawer) roll up into one "Other Stake" row. */
  function buildDistributionRows(withdrawerToLamports) {
    const entries = Array.from(withdrawerToLamports.entries()).sort((a, b) => b[1] - a[1]);
    const named = [];
    let otherLamports = 0;
    for (const [w, lam] of entries) {
      const label = labelForWithdrawer(w);
      if (label.startsWith('Stake ')) {
        otherLamports += lam;
      } else {
        named.push({ withdrawer: w, label, lamports: lam, pct: 0 });
      }
    }
    const rows = [...named];
    if (otherLamports > 0) {
      rows.push({ withdrawer: null, label: 'Other Stake', lamports: otherLamports, pct: 0 });
    }
    rows.sort((a, b) => b.lamports - a.lamports);
    const totalLamports = rows.reduce((s, r) => s + r.lamports, 0);
    for (const r of rows) {
      r.pct = totalLamports > 0 ? (100 * r.lamports) / totalLamports : 0;
    }
    return { rows, totalLamports };
  }

  function renderTable(rows, totalLamports) {
    const tbody = document.getElementById('validatorDistTbody');
    const tfoot = document.getElementById('validatorDistTfoot');
    if (!tbody || !tfoot) return;

    tbody.replaceChildren();
    for (const r of rows) {
      const tr = document.createElement('tr');
      const tdLabel = document.createElement('td');
      tdLabel.textContent = r.label;
      const tdStake = document.createElement('td');
      tdStake.className = 'num';
      tdStake.textContent = `${formatSol(r.lamports)} SOL`;
      const tdPct = document.createElement('td');
      tdPct.className = 'num';
      tdPct.textContent = `${r.pct.toFixed(2)}%`;
      tr.appendChild(tdLabel);
      tr.appendChild(tdStake);
      tr.appendChild(tdPct);
      tbody.appendChild(tr);
    }

    tfoot.replaceChildren();
    const trFoot = document.createElement('tr');
    const tdTotal = document.createElement('td');
    tdTotal.textContent = 'Total';
    const tdTotalStake = document.createElement('td');
    tdTotalStake.className = 'num';
    tdTotalStake.textContent = `${formatSol(totalLamports)} SOL`;
    const tdTotalPct = document.createElement('td');
    tdTotalPct.className = 'num';
    tdTotalPct.textContent = '100%';
    trFoot.appendChild(tdTotal);
    trFoot.appendChild(tdTotalStake);
    trFoot.appendChild(tdTotalPct);
    tfoot.appendChild(trFoot);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderChart(rows) {
    const canvas = document.getElementById('validatorDistChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const compact = document.body && document.body.classList.contains('stake-solana-page');
    const getLegendColor = () => {
      const theme = document.body && document.body.getAttribute('data-theme');
      return theme === 'light' ? 'rgba(17,24,39,0.75)' : 'rgba(255,255,255,0.9)';
    };
    const labels = rows.map((r) => r.label);
    const data = rows.map((r) => r.lamports / 1e9);
    const colors = rows.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

    if (distributionChart) {
      distributionChart.destroy();
      distributionChart = null;
    }

    distributionChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderColor: 'rgba(0,0,0,0.35)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: compact ? 1.35 : undefined,
        layout: compact
          ? {
              padding: {
                left: 2,
                right: 14,
                top: 0,
                bottom: 0,
              },
            }
          : {},
        plugins: {
          legend: {
            position: compact ? 'left' : 'right',
            align: compact ? 'start' : 'center',
            fullSize: compact ? false : true,
            labels: {
              color: getLegendColor(),
              boxWidth: compact ? 14 : 12,
              padding: compact ? 6 : 10,
              font: { size: compact ? 12 : 11 },
            },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = ctx.raw;
                const sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = sum ? ((100 * v) / sum).toFixed(2) : '0';
                return ` ${v.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL (${pct}%)`;
              },
            },
          },
        },
      },
    });

    try {
      const obs = new MutationObserver(() => {
        if (!distributionChart) return;
        const next = getLegendColor();
        distributionChart.options.plugins.legend.labels.color = next;
        distributionChart.update('none');
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (e) {}
  }

  async function loadDistribution() {
    const tbody = document.getElementById('validatorDistTbody');
    if (tbody) tbody.replaceChildren();

    const params = [
      STAKE_PROGRAM_ID,
      {
        encoding: 'jsonParsed',
        filters: [{ memcmp: { offset: STAKE_VOTER_PUBKEY_OFFSET, bytes: VOTE_PUBKEY } }],
      },
    ];

    const { result: accounts } = await rpcWithFallback('getProgramAccounts', params);
    const map = aggregateByWithdrawer(accounts);
    const { rows, totalLamports } = buildDistributionRows(map);

    const activatingLamports = sumActivatingStake(accounts, lastEpochNumber);
    setText('vsPendingActivating', `${formatSol(activatingLamports)} SOL`);

    if (!rows.length) {
      setStatus('No delegated stake accounts returned for this vote key.', true);
      renderTable([], 0);
      return;
    }

    renderTable(rows, totalLamports);
    renderChart(rows);
  }

  async function refreshAll() {
    setStatus('Loading…', false);
    try {
      await loadSnapshot();
      await loadDistribution();
      const statusEl = document.getElementById('validatorStakeStatus');
      if (statusEl && !statusEl.classList.contains('error')) {
        setStatus('Data loaded directly from Solana RPC.', false);
      }
    } catch (e) {
      console.error(e);
      setText('vsPendingActivating', '—');
      setText('vsEpochCountdown', '—');
      setStatus(e.message || 'Failed to load validator data.', true);
    }
  }

  function init() {
    applyBranding();
    const btn = document.getElementById('validatorStakeRefresh');
    if (btn) btn.addEventListener('click', () => refreshAll());

    refreshAll();
    refreshTimer = window.setInterval(refreshAll, 60 * 60 * 1000);
    window.addEventListener('beforeunload', () => {
      if (refreshTimer) clearInterval(refreshTimer);
      if (distributionChart) distributionChart.destroy();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
