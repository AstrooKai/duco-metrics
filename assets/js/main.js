function loadPersistedMetrics(user) {
  try {
    const raw = localStorage.getItem("duco_metrics_" + user);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePersistedMetrics(user, metrics) {
  try {
    localStorage.setItem("duco_metrics_" + user, JSON.stringify(metrics));
  } catch {}
}

function showMetrics(metrics) {
  if (!metrics) return;
  animateNumber(
    document.getElementById("balance"),
    prevBalance,
    metrics.balance,
    (v) =>
      "ᕲ " +
      Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 20,
        useGrouping: false,
      }),
    1200,
  );
  animateNumber(
    document.getElementById("minersCount"),
    prevMinersCount,
    metrics.minersCount,
    (v) => Math.round(v).toString(),
  );
  animateNumber(
    document.getElementById("totalHashrate"),
    prevTotalHashrate,
    metrics.totalHashrate,
    (v) => formatHashrate(v),
  );
  if (document.getElementById("balanceUsd"))
    document.getElementById("balanceUsd").textContent =
      metrics.balanceUsd || "-";
  prevBalance = metrics.balance;
  prevMinersCount = metrics.minersCount;
  prevTotalHashrate = metrics.totalHashrate;
}
let currentUser = null;
let refreshInterval = null;
let statusUpdateInterval = null;
let lastUpdateTime = null;

let prevBalance = 0;
let prevDailyProfit = 0;
let prevMinersCount = 0;
let prevTxCount = 0;
let prevTotalHashrate = 0;

const minersPrev = {};
let achievementsMetadata = null;
let miningState = null;
let minedChart = null;

const loginBox = document.getElementById("loginBox");
const dashboard = document.getElementById("dashboard");
const statusEl = document.getElementById("status");
const usernameInput = document.getElementById("username");
const logoutButton = document.getElementById("logoutButton");
const errorBox = document.getElementById("errorBox");
const greetingTextEl = document.getElementById("greetingText");
const verifyStatusEl = document.getElementById("verifyStatus");
const trustScoreEl = document.getElementById("trustScoreDisplay");
const achievementsButton = document.getElementById("achievementsButton");
const achievementsModalEl = document.getElementById("achievementsModal");
const achievementsModalBodyEl = document.getElementById(
  "achievementsModalBody",
);
let achievementsModalInstance = null;

function getMiningStorageKey(user) {
  return "duco_mining_state_" + user.toLowerCase();
}

function loadMiningState(user) {
  try {
    const raw = localStorage.getItem(getMiningStorageKey(user));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveMiningState(user, state) {
  try {
    localStorage.setItem(getMiningStorageKey(user), JSON.stringify(state));
  } catch {}
}

async function loadAchievementsMetadata() {
  if (achievementsMetadata) return achievementsMetadata;
  try {
    const res = await fetch("assets/data/achievements.json");
    if (!res.ok) return null;
    const json = await res.json();
    let payload = json && (json.result || json);
    if (payload && payload.achievements) payload = payload.achievements;
    achievementsMetadata = payload || null;
  } catch {
    achievementsMetadata = null;
  }
  return achievementsMetadata;
}

function hideErrorBox() {
  if (!errorBox) return;
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
}

function showErrorBox(message) {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function updateGreetingCard(data) {
  if (!greetingTextEl || !verifyStatusEl || !trustScoreEl) return;

  const username =
    currentUser || (data.balance && data.balance.username) || "Miner";
  const now = new Date();
  const hour = now.getHours();
  let greetingPrefix = "Hello";
  if (hour < 12) greetingPrefix = "Good morning";
  else if (hour < 18) greetingPrefix = "Good afternoon";
  else greetingPrefix = "Good evening";

  greetingTextEl.textContent = `${greetingPrefix}, ${username}!`;

  const verified =
    data.balance && String(data.balance.verified).toLowerCase() === "yes";
  if (verified) {
    verifyStatusEl.innerHTML =
      '<i class="fa fa-check-circle"></i><span>Verified</span>';
  } else {
    verifyStatusEl.textContent = "Not verified";
  }
  verifyStatusEl.style.color = verified ? "var(--success)" : "var(--muted)";

  const trust =
    data.balance && (data.balance.trust_score ?? data.balance.trustScore);
  trustScoreEl.textContent = `Trust score: ${trust != null ? trust : "-"}`;

  const achIds = Array.isArray(data.achievements) ? data.achievements : [];
  if (achievementsButton) {
    achievementsButton.textContent = `Achievements: ${achIds.length}`;
    achievementsButton.onclick = async () => {
      if (!achievementsModalEl || !achievementsModalBodyEl) return;

      if (!achievementsModalInstance && window.bootstrap && bootstrap.Modal) {
        achievementsModalInstance = new bootstrap.Modal(achievementsModalEl);
      }

      achievementsModalBodyEl.innerHTML = "";

      const meta = await loadAchievementsMetadata();
      if (!meta) {
        const msg = document.createElement("div");
        msg.textContent = "Failed to load achievements metadata.";
        achievementsModalBodyEl.appendChild(msg);
        return;
      }

      const userSet = new Set(achIds.map((id) => String(id)));

      let list = [];
      if (Array.isArray(meta)) {
        list = meta.slice();
      } else {
        list = Object.entries(meta || {}).map(([id, entry]) => ({
          id,
          ...entry,
        }));
      }
      list = list.filter(Boolean);

      const normalized = list
        .map((entry) => {
          const rawId =
            entry.id ??
            entry.code ??
            entry.key ??
            entry.achievement_id ??
            entry.achievementId;
          if (rawId == null) return null;
          const idStr = String(rawId);
          const category =
            entry.category || entry.group || entry.type || "General";
          return { entry, idStr, category };
        })
        .filter(Boolean);

      normalized.sort((a, b) => {
        const na = Number(a.idStr);
        const nb = Number(b.idStr);
        if (Number.isFinite(na) && Number.isFinite(nb)) {
          return na - nb;
        }
        return a.idStr.localeCompare(b.idStr);
      });

      const groups = new Map();
      normalized.forEach((item) => {
        const key = String(item.category);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });

      const categories = Array.from(groups.keys()).sort();

      categories.forEach((cat) => {
        const section = document.createElement("div");
        section.className = "achievement-category";

        const title = document.createElement("div");
        title.className = "achievement-category-title";
        title.textContent = cat;
        section.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "achievement-grid";

        groups.get(cat).forEach(({ entry, idStr }) => {
          const card = document.createElement("div");
          card.className = "achievement-card";
          if (userSet.has(idStr)) card.classList.add("earned");

          if (entry.icon) {
            const img = document.createElement("img");
            img.className = "achievement-icon";
            img.src = entry.icon;
            img.alt = entry.name || entry.title || idStr;
            card.appendChild(img);
          }

          const textWrap = document.createElement("div");
          textWrap.className = "achievement-text";

          const nameEl = document.createElement("div");
          nameEl.className = "achievement-name";
          const nameText =
            entry.name || entry.title || entry.label || `Achievement ${idStr}`;
          nameEl.textContent = nameText;

          const rewardValue =
            typeof entry.reward === "number" ? entry.reward : null;
          if (rewardValue && !isNaN(rewardValue) && rewardValue > 0) {
            const rewardEl = document.createElement("span");
            rewardEl.className = "achievement-reward";
            rewardEl.textContent = `(+ᕲ ${rewardValue})`;
            nameEl.appendChild(rewardEl);
          }
          textWrap.appendChild(nameEl);

          const desc =
            entry.description || entry.desc || entry.long_description || "";
          if (desc) {
            const descEl = document.createElement("div");
            descEl.className = "achievement-desc";
            descEl.innerHTML = desc;
            textWrap.appendChild(descEl);
          }

          card.appendChild(textWrap);
          grid.appendChild(card);
        });

        section.appendChild(grid);
        achievementsModalBodyEl.appendChild(section);
      });

      if (achievementsModalInstance) {
        achievementsModalInstance.show();
      }
    };
  }
}

const savedUser = localStorage.getItem("duco_username");
if (savedUser) {
  usernameInput.value = savedUser;
  startSession(savedUser);
}

usernameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") login();
});

function login() {
  const user = usernameInput.value.trim();
  if (!user) return;
  startSession(user);
}

function fadeOut(el) {
  return new Promise((resolve) => {
    el.classList.add("fade-out");
    el.classList.remove("fade-in");
    el.addEventListener(
      "transitionend",
      function handler() {
        el.removeEventListener("transitionend", handler);
        el.classList.add("hidden");
        resolve();
      },
      { once: true },
    );
  });
}

function fadeIn(el) {
  el.classList.remove("hidden");
  el.classList.add("fade-out");
  // Force reflow so the browser registers opacity:0 before transitioning
  void el.offsetWidth;
  el.classList.remove("fade-out");
  el.classList.add("fade-in");
}

function startSession(user) {
  currentUser = user;
  localStorage.setItem("duco_username", user);
  fadeOut(loginBox).then(() => {
    fadeIn(dashboard);
    fadeIn(logoutButton);
  });

  hideErrorBox();

  miningState = loadMiningState(user);
  if (miningState) {
    updateMinedChart();
    updateEstimatedProfit();
  }

  fetchData();
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(fetchData, 10000);

  if (statusUpdateInterval) clearInterval(statusUpdateInterval);
  statusUpdateInterval = setInterval(updateStatusTime, 1000);
}

function logout() {
  localStorage.removeItem("duco_username");
  currentUser = null;
  if (refreshInterval) clearInterval(refreshInterval);
  if (statusUpdateInterval) clearInterval(statusUpdateInterval);

  fadeOut(dashboard).then(() => {
    fadeIn(loginBox);
  });
  fadeOut(logoutButton);

  document.getElementById("balance").textContent = "-";
  const balanceUsdEl = document.getElementById("balanceUsd");
  if (balanceUsdEl) balanceUsdEl.textContent = "-";
  const profitEl = document.getElementById("profit");
  if (profitEl) profitEl.textContent = "-";
  document.getElementById("minersCount").textContent = "-";
  document.getElementById("txCount").textContent = "-";
  const totalHashrateEl = document.getElementById("totalHashrate");
  if (totalHashrateEl) totalHashrateEl.textContent = "-";
  prevTotalHashrate = 0;

  miningState = null;
  prevDailyProfit = 0;

  const minersBody = document.getElementById("minersBody");
  if (minersBody) minersBody.innerHTML = "";

  const transactionsContainer = document.getElementById("transactions");
  if (transactionsContainer) transactionsContainer.innerHTML = "";

  for (const key in minersPrev) delete minersPrev[key];

  statusEl.innerHTML = '<span class="live-dot"></span>Disconnected';
}

async function fetchData() {
  if (!currentUser) return;

  try {
    statusEl.innerHTML = '<span class="live-dot"></span>Fetching...';

    const res = await fetch(
      "https://server.duinocoin.com/v2/users/" + currentUser,
    );
    if (!res.ok) {
      const err = new Error("API error");
      err.status = res.status;
      throw err;
    }

    const json = await res.json();
    const data = json.result;
    const balanceValue = Number(data.balance.balance);
    const minersValue = data.miners.length;
    const txValue = data.transactions.length;

    const totalHashrate = (data.miners || []).reduce(
      (sum, m) => sum + (Number(m.hashrate) || 0),
      0,
    );

    animateNumber(
      document.getElementById("balance"),
      prevBalance,
      balanceValue,
      (v) =>
        "ᕲ " +
        Number(v).toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 20,
          useGrouping: false,
        }),
      1200,
    );
    animateNumber(
      document.getElementById("minersCount"),
      prevMinersCount,
      minersValue,
      (v) => Math.round(v).toString(),
    );
    animateNumber(
      document.getElementById("totalHashrate"),
      prevTotalHashrate,
      totalHashrate,
      (v) => formatHashrate(v),
    );

    prevBalance = balanceValue;
    prevMinersCount = minersValue;
    prevTxCount = txValue;
    prevTotalHashrate = totalHashrate;

    const now = Date.now();

    if (!miningState) {
      const knownIds = new Set();
      (data.transactions || []).forEach((tx) => {
        const id = String(tx.id ?? tx.hash ?? "");
        if (id) knownIds.add(id);
      });
      miningState = {
        minedTotal: 0,
        lastBalance: balanceValue,
        knownTxIds: Array.from(knownIds),
        points: [{ t: now, minedTotal: 0 }],
      };
    } else {
      const knownIds = new Set(miningState.knownTxIds || []);
      let incomingNew = 0;
      (data.transactions || []).forEach((tx) => {
        const id = String(tx.id ?? tx.hash ?? "");
        if (!id || knownIds.has(id)) return;
        knownIds.add(id);
        if (
          tx.recipient &&
          currentUser &&
          tx.recipient.toLowerCase() === currentUser.toLowerCase()
        ) {
          incomingNew += Number(tx.amount) || 0;
        }
      });

      const delta = balanceValue - (miningState.lastBalance || 0);
      let minedDelta = delta - incomingNew;
      if (!isFinite(minedDelta) || minedDelta < 0) minedDelta = 0;

      miningState.minedTotal = (miningState.minedTotal || 0) + minedDelta;
      miningState.lastBalance = balanceValue;
      miningState.knownTxIds = Array.from(knownIds);
      miningState.points = miningState.points || [];
      miningState.points.push({ t: now, minedTotal: miningState.minedTotal });

      const cutoff24h = now - 24 * 60 * 60 * 1000;
      miningState.points = miningState.points.filter((p) => p.t >= cutoff24h);
    }

    if (currentUser && miningState) saveMiningState(currentUser, miningState);

    updateMinedChart();
    updateEstimatedProfit();

    const balanceUsdEl = document.getElementById("balanceUsd");
    if (balanceUsdEl) {
      const maxRate =
        (data.exch_rtes &&
          data.exch_rtes.max &&
          Number(data.exch_rtes.max.price)) ||
        (data.prices && Number(data.prices.max)) ||
        0;
      const usdValue = balanceValue * maxRate;
      if (!isNaN(usdValue) && usdValue > 0) {
        balanceUsdEl.textContent =
          "~ $" +
          usdValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
      } else {
        balanceUsdEl.textContent = "-";
      }
    }

    renderMiners(data.miners);
    renderTransactions(data.transactions);
    updateGreetingCard(data);
    lastUpdateTime = Date.now();
    hideErrorBox();
  } catch (err) {
    statusEl.textContent = "Failed to fetch data.";
    const isRateLimited = err && (err.status === 403 || err.status === 429);
    const msg = isRateLimited
      ? "Request to DUCO server was blocked and rate limited. Please wait a moment and try again."
      : "Failed to reach DUCO server. Please try again shortly.";
    showErrorBox(msg);

    // Show error messages for miners and transactions if their tables are empty
    const minersContainer = document.getElementById("miners");
    if (minersContainer) {
      const tbody = minersContainer.querySelector("tbody");
      const hasRows = tbody && tbody.children.length > 0;
      if (!hasRows) {
        minersContainer.innerHTML = "";
        const msgEl = document.createElement("div");
        msgEl.className = "muted empty-state";
        msgEl.textContent = "Failed to Fetch Miners Data";
        minersContainer.appendChild(msgEl);
      }
    }

    const transactionsContainer = document.getElementById("transactions");
    if (transactionsContainer) {
      if (!transactionsContainer.children.length) {
        transactionsContainer.innerHTML = "";
        const msgEl = document.createElement("div");
        msgEl.className = "muted empty-state";
        msgEl.textContent = "Failed to Fetch Recent Transactions";
        transactionsContainer.appendChild(msgEl);
      }
    }
    // Do not reset metrics; keep last data visible
  }
}

function animateNumber(element, from, to, formatFn, duration = 800) {
  if (!element) return;
  if (typeof from !== "number" || isNaN(from)) from = 0;
  if (from === to) {
    element.textContent = formatFn(to);
    return;
  }

  const start = performance.now();

  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + (to - from) * eased;
    element.textContent = formatFn(current);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function initMinedChart() {
  if (minedChart) return;
  const canvas = document.getElementById("minedChart");
  if (!canvas || typeof Chart === "undefined") return;
  const ctx = canvas.getContext("2d");

  minedChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Mined DUCOs",
          data: [],
          borderColor: "rgba(248, 150, 61, 1)",
          backgroundColor: "rgba(248, 150, 61, 0.18)",
          tension: 0.25,
          pointRadius: 0,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
      resizeDelay: 100,
      layout: { padding: { top: 6, right: 10, bottom: 6, left: 10 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.y || 0;
              return (
                "ᕲ " +
                Number(v).toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 20,
                  useGrouping: false,
                })
              );
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#9ca3af",
            maxRotation: 0,
            minRotation: 0,
            autoSkip: true,
            autoSkipPadding: 12,
            maxTicksLimit: 6,
            padding: 8,
            callback: function (value, index, ticks) {
              // Always show first and last tick
              if (index === 0 || index === ticks.length - 1) {
                return this.getLabelForValue(value);
              }
              return this.getLabelForValue(value);
            },
          },
          afterBuildTicks: function (axis) {
            if (!axis.ticks || axis.ticks.length < 2) return;
            const all = axis.ticks;
            const first = all[0];
            const last = all[all.length - 1];
            const maxMiddle = 4; // max ticks between first and last
            if (all.length <= maxMiddle + 2) return;
            // Keep first, last, and evenly spaced middle ticks
            const step = (all.length - 2) / (maxMiddle + 1);
            const kept = [first];
            for (let i = 1; i <= maxMiddle; i++) {
              kept.push(all[Math.round(i * step)]);
            }
            kept.push(last);
            axis.ticks = kept;
          },
          grid: { display: false },
        },
        y: {
          ticks: { color: "#9ca3af", padding: 8 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },
    },
  });
}

function updateMinedChart() {
  if (!miningState || !miningState.points || !miningState.points.length) return;
  if (!minedChart) initMinedChart();
  if (!minedChart) return;

  // Only show last 24 hours
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const points = miningState.points.filter((p) => p.t >= cutoff);
  if (!points.length) return;

  minedChart.data.labels = points.map((p) => formatChartTickFromMs(p.t));
  minedChart.data.datasets[0].data = points.map((p) =>
    Number(p.minedTotal || 0),
  );
  minedChart.update();
}

function formatChartTickFromMs(ms) {
  const date = new Date(ms);
  if (isNaN(date.getTime())) return "";
  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const pad = (n) => (n < 10 ? "0" + n : String(n));
  const time = hours + ":" + pad(minutes) + " " + ampm + " UTC";

  const now = new Date();
  const todayUTC = now.getUTCDate();
  const pointUTC = date.getUTCDate();
  if (pointUTC !== todayUTC) {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return months[date.getUTCMonth()] + " " + pointUTC + ", " + time;
  }
  return time;
}

function updateEstimatedProfit() {
  const profitEl = document.getElementById("profit");
  if (!profitEl || !miningState || !miningState.points) {
    if (profitEl) profitEl.textContent = "-";
    prevDailyProfit = 0;
    return;
  }

  // Only use last 24 hours of data
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const points = miningState.points.filter((p) => p.t >= cutoff);
  if (points.length < 2) {
    profitEl.textContent = "-";
    prevDailyProfit = 0;
    return;
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const spanSeconds = Math.max(60, (lastPoint.t - firstPoint.t) / 1000);
  const minedIn24h = (lastPoint.minedTotal || 0) - (firstPoint.minedTotal || 0);
  const dailyProfit = (minedIn24h / spanSeconds) * 86400;

  animateNumber(
    profitEl,
    prevDailyProfit,
    dailyProfit,
    (v) =>
      "ᕲ " +
      Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 20,
        useGrouping: false,
      }),
  );
  prevDailyProfit = dailyProfit;
}

function updateStatusTime() {
  if (!lastUpdateTime) return;
  const seconds = Math.floor((Date.now() - lastUpdateTime) / 1000);
  let text;

  if (seconds < 3) {
    text = "just now";
  } else if (seconds < 60) {
    text = seconds + " second" + (seconds === 1 ? "" : "s") + " ago";
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    text = minutes + " minute" + (minutes === 1 ? "" : "s") + " ago";
  } else {
    const hours = Math.floor(seconds / 3600);
    text = hours + " hour" + (hours === 1 ? "" : "s") + " ago";
  }

  statusEl.innerHTML = '<span class="live-dot"></span>Live • Updated ' + text;
}

function formatHashrate(value) {
  let unit = "H/s";
  let v = value;
  if (v >= 1_000_000) {
    v /= 1_000_000;
    unit = "MH/s";
  } else if (v >= 1_000) {
    v /= 1_000;
    unit = "kH/s";
  }
  return v.toFixed(2) + " " + unit;
}

function parseDucoDate(raw) {
  if (raw == null || raw === "") return null;
  const str = typeof raw === "string" ? raw.trim() : String(raw).trim();
  if (!str) return null;

  let date;

  if (/^\d+(?:\.\d+)?$/.test(str)) {
    const num = Number(str);
    if (!Number.isFinite(num)) return null;
    const ms = num < 1e12 ? num * 1000 : num;
    date = new Date(ms);
  } else {
    let m = str.match(
      /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/,
    );

    if (m) {
      const [, d, mo, y, h, mi, s] = m;
      date = new Date(
        Date.UTC(
          Number(y),
          Number(mo) - 1,
          Number(d),
          Number(h),
          Number(mi),
          Number(s),
        ),
      );
    } else {
      m = str.match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/,
      );

      if (m) {
        const [, y, mo2, d2, h2, mi2, s2] = m;
        date = new Date(
          Date.UTC(
            Number(y),
            Number(mo2) - 1,
            Number(d2),
            Number(h2),
            Number(mi2),
            Number(s2),
          ),
        );
      } else {
        date = new Date(str);
      }
    }
  }

  return isNaN(date.getTime()) ? null : date;
}

function formatUtcTimestamp(value) {
  const date = parseDucoDate(value);
  if (!date) return value != null ? String(value) : "";

  const day = date.getUTCDate();
  const monthIndex = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const hours24 = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthName = monthNames[monthIndex] || "";
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const pad = (n) => (n < 10 ? "0" + n : String(n));

  return (
    day +
    " " +
    monthName +
    " " +
    year +
    " " +
    hours12 +
    ":" +
    pad(minutes) +
    ":" +
    pad(seconds) +
    " " +
    ampm +
    " UTC"
  );
}

function formatRelativeTime(value) {
  const date = parseDucoDate(value);
  if (!date) return "";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return "just now";

  if (seconds < 5) return "just now";
  if (seconds < 60)
    return seconds + " second" + (seconds === 1 ? "" : "s") + " ago";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return minutes + " minute" + (minutes === 1 ? "" : "s") + " ago";

  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return hours + " hour" + (hours === 1 ? "" : "s") + " ago";

  const days = Math.floor(seconds / 86400);
  return days + " day" + (days === 1 ? "" : "s") + " ago";
}

function renderMiners(miners) {
  const tbody = document.getElementById("minersBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!miners.length) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 10;
    emptyCell.className = "muted";
    emptyCell.textContent = "No active miners.";
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    return;
  }

  miners.forEach((m, index) => {
    const id = m.threadid || m.identifier || m.software;
    const prev = minersPrev[id] || {};
    const row = document.createElement("tr");

    const noCell = document.createElement("td");
    noCell.textContent = index + 1;

    const softwareCell = document.createElement("td");
    softwareCell.className = "miner-software";
    softwareCell.textContent = m.software;

    const identifierCell = document.createElement("td");
    identifierCell.className = "miner-identifier";
    identifierCell.textContent =
      m.identifier && m.identifier !== "None" ? m.identifier : "-";

    const acceptedCell = document.createElement("td");
    const acceptedSpan = document.createElement("span");
    acceptedSpan.className = "accepted";
    acceptedCell.appendChild(acceptedSpan);

    const rejectedCell = document.createElement("td");
    const rejectedSpan = document.createElement("span");
    rejectedSpan.className = "rejected";
    rejectedCell.appendChild(rejectedSpan);

    const hashrateCell = document.createElement("td");
    const hashrateSpan = document.createElement("span");
    hashrateCell.appendChild(hashrateSpan);

    const difficultyCell = document.createElement("td");
    difficultyCell.textContent = m.diff ?? "-";

    const pingCell = document.createElement("td");
    pingCell.textContent = typeof m.pg === "number" ? m.pg + " ms" : "-";

    const poolCell = document.createElement("td");
    poolCell.textContent = m.pool || "-";

    const algoCell = document.createElement("td");
    algoCell.textContent = m.algorithm || "-";

    row.appendChild(noCell);
    row.appendChild(softwareCell);
    row.appendChild(identifierCell);
    row.appendChild(acceptedCell);
    row.appendChild(rejectedCell);
    row.appendChild(hashrateCell);
    row.appendChild(difficultyCell);
    row.appendChild(pingCell);
    row.appendChild(poolCell);
    row.appendChild(algoCell);

    tbody.appendChild(row);

    const currentHashrate = Number(m.hashrate) || 0;
    const currentAccepted = Number(m.accepted) || 0;
    const currentRejected = Number(m.rejected) || 0;

    animateNumber(
      hashrateSpan,
      prev.hashrate ?? 0,
      currentHashrate,
      (v) => formatHashrate(v),
      1000,
    );
    animateNumber(acceptedSpan, prev.accepted ?? 0, currentAccepted, (v) =>
      Math.round(v).toLocaleString(),
    );
    animateNumber(rejectedSpan, prev.rejected ?? 0, currentRejected, (v) =>
      Math.round(v).toLocaleString(),
    );

    minersPrev[id] = {
      hashrate: currentHashrate,
      accepted: currentAccepted,
      rejected: currentRejected,
    };
  });
}

function renderTransactions(txs) {
  const container = document.getElementById("transactions");
  if (!container) return;
  container.innerHTML = "";

  if (!txs.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No transactions found.";
    container.appendChild(empty);
    return;
  }

  txs.slice(0, 5).forEach((tx) => {
    const item = document.createElement("div");
    item.className = "tx-item";

    const left = document.createElement("div");
    left.className = "tx-left";

    const from = document.createElement("div");
    from.className = "tx-from";
    from.appendChild(document.createTextNode("from "));
    const senderSpan = document.createElement("span");
    senderSpan.className = "tx-sender";
    senderSpan.textContent = tx.sender || "unknown";
    from.appendChild(senderSpan);

    const memo = document.createElement("div");
    memo.className = "tx-memo";
    const memoText =
      tx.memo && String(tx.memo).trim().length
        ? String(tx.memo)
        : "Transaction";
    memo.textContent = '"' + memoText + '"';

    left.appendChild(from);
    left.appendChild(memo);

    const right = document.createElement("div");
    right.className = "tx-right";

    const date = document.createElement("div");
    date.className = "tx-date";

    const rawTs =
      tx.datetime || tx.timestamp || tx.time || tx.date || tx.datetime_utc;

    const exactTs = formatUtcTimestamp(rawTs);
    const relativeTs = formatRelativeTime(rawTs);

    const dateSpan = document.createElement("span");
    dateSpan.textContent = relativeTs || exactTs;
    if (exactTs) {
      dateSpan.title = exactTs;
      date.title = exactTs;
    }

    const hash = String(tx.hash || tx.id || "");
    if (hash) {
      const sep = document.createTextNode(" · ");
      const link = document.createElement("a");
      link.href =
        "https://explorer.duinocoin.com/?search=" + encodeURIComponent(hash);
      link.textContent = hash;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      date.appendChild(dateSpan);
      date.appendChild(sep);
      date.appendChild(link);
    } else {
      date.appendChild(dateSpan);
    }

    const amount = document.createElement("div");
    amount.className = "tx-amount";
    amount.textContent = `+ᕲ ${tx.amount}`;

    right.appendChild(date);
    right.appendChild(amount);

    item.appendChild(left);
    item.appendChild(right);

    container.appendChild(item);
  });
}