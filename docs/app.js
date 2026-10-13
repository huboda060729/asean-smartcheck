const form = document.getElementById('screeningForm');
const resultPanel = document.getElementById('resultPanel');
const resultContent = document.getElementById('resultContent');
const emptyState = document.getElementById('emptyState');
const submitButton = form.querySelector('button[type="submit"]');

let currentResult = null;
let samples = {};
let toastTimer = null;

const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value ?? '';
}

function numberValue(name) {
  const input = form.querySelector(`[name="${name}"]`);
  if (!input || input.value.trim() === '') return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function textValue(name) {
  const input = form.querySelector(`[name="${name}"]`);
  return input ? input.value.trim() : '';
}

function checkboxValue(name) {
  const input = form.querySelector(`[name="${name}"]`);
  return Boolean(input?.checked);
}

function symptomValue(name) {
  const input = form.querySelector(`[data-symptom="${name}"]`);
  return Boolean(input?.checked);
}

function exposureValue(name) {
  const input = form.querySelector(`[data-exposure="${name}"]`);
  return Boolean(input?.checked);
}

function collectPayload() {
  const testFields = form.querySelectorAll('[data-test]');
  const tests = {};
  testFields.forEach((field) => { tests[field.dataset.test] = field.value; });

  return {
    person: {
      age: numberValue('age'),
      sex: textValue('sex'),
      nationality: textValue('nationality'),
      chronic_disease: checkboxValue('chronic_disease'),
      pregnancy: checkboxValue('pregnancy'),
    },
    travel: {
      visited_countries: textValue('visited_countries'),
      days_since_exposure: numberValue('days_since_exposure'),
      mosquito_exposure: exposureValue('mosquito_exposure'),
      animal_contact: exposureValue('animal_contact'),
      crowded_setting: exposureValue('crowded_setting'),
      sick_contact: exposureValue('sick_contact'),
      rural_or_farm: exposureValue('rural_or_farm'),
    },
    symptoms: {
      fever: symptomValue('fever'),
      onset_days: numberValue('onset_days'),
      rash: symptomValue('rash'),
      joint_pain: symptomValue('joint_pain'),
      headache: symptomValue('headache'),
      retroorbital_pain: symptomValue('retroorbital_pain'),
      myalgia: symptomValue('myalgia'),
      vomiting: symptomValue('vomiting'),
      diarrhea: symptomValue('diarrhea'),
      bleeding: symptomValue('bleeding'),
      confusion: symptomValue('confusion'),
      cough: symptomValue('cough'),
      sore_throat: symptomValue('sore_throat'),
      breathing_difficulty: symptomValue('breathing_difficulty'),
      conjunctivitis: symptomValue('conjunctivitis'),
      lymphadenopathy: symptomValue('lymphadenopathy'),
      hand_foot_mouth: symptomValue('hand_foot_mouth'),
    },
    vitals: {
      temperature: numberValue('temperature'),
      heart_rate: numberValue('heart_rate'),
      respiratory_rate: numberValue('respiratory_rate'),
      systolic_bp: numberValue('systolic_bp'),
      diastolic_bp: numberValue('diastolic_bp'),
      spo2: numberValue('spo2'),
    },
    labs: {
      wbc: numberValue('wbc'),
      platelets: numberValue('platelets'),
      crp: numberValue('crp'),
      alt: numberValue('alt'),
      ast: numberValue('ast'),
    },
    tests,
  };
}

function fillForm(payload) {
  const setInput = (name, value) => {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return;
    input.value = value ?? '';
  };

  setInput('age', payload.person?.age);
  setInput('sex', payload.person?.sex || '未说明');
  setInput('nationality', payload.person?.nationality);
  form.querySelector('[name="chronic_disease"]').checked = Boolean(payload.person?.chronic_disease);
  form.querySelector('[name="pregnancy"]').checked = Boolean(payload.person?.pregnancy);

  setInput('visited_countries', payload.travel?.visited_countries);
  setInput('days_since_exposure', payload.travel?.days_since_exposure);
  form.querySelectorAll('[data-exposure]').forEach((input) => {
    input.checked = Boolean(payload.travel?.[input.dataset.exposure]);
  });

  setInput('onset_days', payload.symptoms?.onset_days);
  form.querySelectorAll('[data-symptom]').forEach((input) => {
    input.checked = Boolean(payload.symptoms?.[input.dataset.symptom]);
  });

  ['temperature', 'heart_rate', 'respiratory_rate', 'systolic_bp', 'diastolic_bp', 'spo2'].forEach((key) => {
    setInput(key, payload.vitals?.[key]);
  });
  ['wbc', 'platelets', 'crp', 'alt', 'ast'].forEach((key) => {
    setInput(key, payload.labs?.[key]);
  });
  form.querySelectorAll('[data-test]').forEach((select) => {
    select.value = payload.tests?.[select.dataset.test] || 'unknown';
  });
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function safeLevel(level) {
  return ['blue', 'yellow', 'orange', 'red'].includes(level) ? level : 'blue';
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function renderList(containerId, items, emptyText) {
  const container = $(containerId);
  if (!container) return;
  container.replaceChildren();
  const values = Array.isArray(items) && items.length ? items : [emptyText];
  values.forEach((value) => container.appendChild(createElement('li', '', value)));
}

function renderPathogens(pathogens) {
  const container = $('pathogenList');
  if (!container) return;
  container.replaceChildren();
  if (!pathogens?.length) {
    container.appendChild(createElement('p', 'muted', '暂无可疑病原排序。'));
    return;
  }
  pathogens.forEach((pathogen, index) => {
    const row = createElement('div', 'pathogen-row');
    const top = createElement('div', 'pathogen-top');
    const name = createElement('strong', '', `${index + 1}. ${pathogen.name}`);
    const score = createElement('span', '', `指数 ${pathogen.score} · 相对占比 ${Math.round((pathogen.relative_share || 0) * 100)}%`);
    top.append(name, score);
    const track = createElement('div', 'bar-track');
    const fill = createElement('div', 'bar-fill');
    fill.style.width = `${Math.max(3, Math.min(100, pathogen.score))}%`;
    track.appendChild(fill);
    const evidence = createElement('div', 'pathogen-evidence', pathogen.evidence?.slice(0, 3).join('；') || '证据有限');
    row.append(top, track, evidence);
    container.appendChild(row);
  });
}

function renderGuardrails(guardrails) {
  const container = $('guardrailList');
  if (!container) return;
  container.replaceChildren();
  (guardrails || []).forEach((guardrail) => {
    const item = createElement('div', 'guardrail-item');
    const dot = createElement('span', `guardrail-dot${guardrail.status === 'review' ? ' review' : ''}`);
    const copy = createElement('div');
    copy.append(
      createElement('strong', '', guardrail.name),
      createElement('p', '', guardrail.detail),
    );
    item.append(dot, copy);
    container.appendChild(item);
  });
}

function renderTrace(trace) {
  const container = $('traceList');
  if (!container) return;
  container.replaceChildren();
  (trace || []).forEach((step, index) => {
    const item = createElement('li');
    const badge = createElement('span', 'trace-index', String(index + 1).padStart(2, '0'));
    const copy = createElement('div');
    copy.append(createElement('strong', '', step.step), document.createElement('br'), createElement('small', '', step.detail));
    const status = createElement('span', `mini-badge ${step.status === 'review' ? 'mini-review' : 'mini-safe'}`, step.status === 'review' ? '复核' : '通过');
    item.append(badge, copy, status);
    container.appendChild(item);
  });
}

function renderResult(result) {
  currentResult = result;
  const level = safeLevel(result.risk.warning_level);
  const confidencePercent = Math.round((result.trust.confidence || 0) * 100);
  const lowConfidence = Boolean(result.trust.low_confidence);

  emptyState.hidden = true;
  resultContent.hidden = false;
  resultContent.innerHTML = `
    <div class="result-banner level-${level}${lowConfidence ? ' is-reject' : ''}">
      <div>
        <span class="level-badge">${lowConfidence ? '证据不足 · 已拒答' : result.risk.warning_label}</span>
        <h2 id="resultTitle"></h2>
        <p id="resultSummary"></p>
      </div>
      <div class="result-banner-actions">
        <button class="ghost-button" id="exportButton" type="button">导出 JSON</button>
        <button class="ghost-button" id="printButton" type="button">打印报告</button>
      </div>
    </div>
    <div id="rejectBanner"></div>
    <div class="result-meta">
      <div><span id="metaRiskLabel">风险指数</span><strong id="metaRisk"></strong></div>
      <div><span>数据质量</span><strong id="metaQuality"></strong></div>
      <div><span>AI 置信度</span><strong id="metaConfidence"></strong></div>
      <div><span>评估耗时</span><strong id="metaLatency"></strong></div>
    </div>
    <div class="result-grid">
      <div class="stack">
        <article class="result-card gauge-card level-${level}">
          <h3 id="gaugeTitle">综合风险指数</h3>
          <div class="risk-gauge" id="riskGauge"><div><strong id="riskScore"></strong><span>满分 99</span></div></div>
          <p class="muted" id="gaugeNote">该指数用于演示分层逻辑，并非校准后的临床概率。</p>
        </article>
        <article class="result-card">
          <h3>感染阶段 / 时间窗</h3>
          <div class="info-block"><strong id="stageLabel"></strong><p id="stageWindow"></p><p id="stageDetail"></p></div>
        </article>
        <article class="result-card">
          <h3>严重程度</h3>
          <div class="info-block"><strong id="severityLabel"></strong><p id="severityFlags"></p></div>
        </article>
      </div>
      <div class="stack">
        <article class="result-card">
          <h3>可疑病原范围</h3>
          <p class="muted">按输入证据的规则评分排序，仅用于提示检测方向。</p>
          <div class="pathogen-list" id="pathogenList"></div>
          <p class="relative-note" id="relativeNote">“相对占比”仅表示候选之间的相对排序，不代表真实感染概率。</p>
        </article>
        <article class="result-card">
          <h3>风险证据链</h3>
          <ul class="evidence-list" id="evidenceList"></ul>
        </article>
        <article class="result-card">
          <h3>建议检测</h3>
          <ul class="action-list" id="testList"></ul>
          <h3 class="detail-card">分层处置建议</h3>
          <ul class="action-list" id="actionList"></ul>
          <div class="info-block detail-card"><strong>随访建议</strong><p id="followUp"></p></div>
        </article>
        <article class="result-card">
          <h3>可信 AI 控制面板</h3>
          <div class="confidence-row"><span>置信度</span><div class="confidence-track"><div class="confidence-fill" id="confidenceFill"></div></div><strong id="confidenceText"></strong></div>
          <p class="metric-note" id="confidenceNote" hidden></p>
          <div class="guardrail-list detail-card" id="guardrailList"></div>
        </article>
        <article class="result-card">
          <h3>算法可观测轨迹</h3>
          <ul class="trace-list" id="traceList"></ul>
          <p class="relative-note" id="modelMeta"></p>
        </article>
      </div>
    </div>
  `;

  setText('resultTitle', lowConfidence
    ? '暂无法判断 · 转人工复核'
    : `${result.risk.label} · ${result.risk.warning_label}`);
  // 拒答时不呈现结论性摘要，避免被误读为"已完成评估"
  setText('resultSummary', lowConfidence
    ? '信息不足或候选证据差异不明显，系统不输出确定性结论，已转人工复核。'
    : result.risk.summary);
  setText('metaRiskLabel', lowConfidence ? '风险指数（规则原始输出）' : '风险指数');
  setText('metaRisk', `${result.risk.score} / 99`);
  setText('metaQuality', `${result.data_quality.score} / 100`);
  setText('metaConfidence', `${confidencePercent}%`);
  setText('metaLatency', `${result.latency_ms} ms`);
  setText('riskScore', result.risk.score);
  setText('gaugeTitle', lowConfidence ? '综合风险指数（规则引擎原始输出）' : '综合风险指数');
  setText('gaugeNote', lowConfidence
    ? '数值为规则引擎原始输出，仅用于演示分层逻辑；本次证据不足，低分不代表零风险，也不构成安全结论。'
    : '该指数用于演示分层逻辑，并非校准后的临床概率。');
  setText('stageLabel', result.stage.label);
  setText('stageWindow', result.stage.window);
  setText('stageDetail', result.stage.detail);
  setText('severityLabel', lowConfidence ? '暂无法评估' : `${result.severity.label}风险 · ${result.severity.score}/100`);
  setText('severityFlags', lowConfidence
    ? '信息不足不代表风险低；缺少关键信息时，系统不对严重程度做分级判断。'
    : result.severity.flags.join('；'));
  setText('relativeNote', lowConfidence
    ? '“相对占比”只是候选病原之间的相对排序指标，不代表感染概率，也不代表诊断概率；本次为拒答状态，未形成病原学结论。'
    : '“相对占比”仅表示候选之间的相对排序，不代表真实感染概率。');
  const confidenceNote = $('confidenceNote');
  if (confidenceNote) {
    if (lowConfidence) {
      confidenceNote.hidden = false;
      confidenceNote.textContent = '置信度是系统内部指标，不代表患病概率；证据不足时，它不构成可靠的风险判断依据。';
    } else {
      confidenceNote.hidden = true;
      confidenceNote.textContent = '';
    }
  }
  setText('followUp', result.recommendations.follow_up);
  setText('confidenceText', `${confidencePercent}%`);
  setText('modelMeta', `${result.model.name} · ${result.model.version} · 请求编号 ${result.request_id}`);

  const rejectBanner = $('rejectBanner');
  if (lowConfidence) {
    rejectBanner.className = 'reject-banner';
    rejectBanner.textContent = `安全拒答：${result.trust.reject_reason || '当前证据不足，系统不输出确定性判断。'} 已建议转人工复核。规则引擎原始输出：${result.risk.warning_label}（风险指数 ${result.risk.score}/99，置信度 ${confidencePercent}%）。`;
  }

  const gauge = $('riskGauge');
  gauge.style.setProperty('--score', `${Math.max(0, Math.min(100, result.risk.score))}%`);
  const confidenceFill = $('confidenceFill');
  confidenceFill.style.width = `${confidencePercent}%`;

  renderPathogens(result.pathogens);
  renderList('evidenceList', result.risk.evidence, '暂无明确风险证据');
  renderList('testList', result.recommendations.tests, '结合临床评估确定检测项目');
  renderList('actionList', result.recommendations.actions, '按常规流程处置');
  renderGuardrails(result.trust.guardrails);
  renderTrace(result.trace);

  $('exportButton').addEventListener('click', exportCurrentResult);
  $('printButton').addEventListener('click', () => window.print());
}

function exportCurrentResult() {
  if (!currentResult) return;
  const blob = new Blob([JSON.stringify(currentResult, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `东盟通检智防_${currentResult.request_id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('评估结果已导出，未包含姓名等直接身份标识。');
}

const localMetrics = {
  totalRequests: 0,
  highRiskAlerts: 0,
  rejections: 0,
  errorCount: 0,
  latencies: [],
  logs: []
};

function recordLocalResult(result) {
  localMetrics.totalRequests += 1;
  localMetrics.latencies.push(Number(result.latency_ms) || 0);
  if (localMetrics.latencies.length > 1000) localMetrics.latencies.shift();
  if (result.risk.warning_level === 'orange' || result.risk.warning_level === 'red') {
    localMetrics.highRiskAlerts += 1;
  }
  if (result.trust.low_confidence) localMetrics.rejections += 1;
  localMetrics.logs.unshift({
    request_id: result.request_id,
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    warning_level: result.risk.warning_level,
    warning_label: result.risk.warning_label,
    latency_ms: result.latency_ms,
    data_quality: result.data_quality.score,
    confidence: result.trust.confidence,
    low_confidence: result.trust.low_confidence,
    requires_human_review: result.trust.requires_human_review
  });
  localMetrics.logs = localMetrics.logs.slice(0, 50);
}

/* 结果面板是否已在当前视口内可见到"能读出结论"的程度。
   完全在视口之外、或可见高度不足 120px（也要求不超过面板高度的 20%）时，认为不可见。
   阈值依据实测：1920x1080 可见约 319px、1440x900 可见约 139px → 视为已可见，不滚动；
   1366x768 仅约 7px、1280x720 为 0px → 视为不可见，提交后滚动到结果。 */
function isResultPanelVisible() {
  if (!resultPanel) return false;
  const rect = resultPanel.getBoundingClientRect();
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  if (rect.bottom <= 0 || rect.top >= viewport) return false;
  const visible = Math.min(rect.bottom, viewport) - Math.max(rect.top, 0);
  return visible >= Math.min(120, rect.height * 0.2);
}

function submitScreening(event) {
  event.preventDefault();
  const original = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.textContent = '正在执行本地可信评估…';
  try {
    const result = window.SmartCheckEngine.assess(collectPayload());
    recordLocalResult(result);
    renderResult(result);
    refreshObservability();
    // 结果已在视口内可见时不强制滚动；否则滚动到结果，确保提交后能看到结论（桌面端与移动端一致）
    if (!isResultPanelVisible()) resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('评估完成：浏览器本地生成证据链与分层预警。');
  } catch (error) {
    localMetrics.errorCount += 1;
    showToast(`评估失败：${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = original;
  }
}

function loadSamples() {
  samples = (window.SmartCheckEngine && window.SmartCheckEngine.SAMPLES) || {};
  if (samples.dengue) fillForm(samples.dengue);
}

function activatePreset(name) {
  document.querySelectorAll('.preset-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.preset === name);
  });
  if (samples[name]) {
    fillForm(samples[name]);
    showToast(`已载入“${name}”演示案例，可点击开始筛查。`);
  }
}

function refreshObservability() {
  const ordered = [...localMetrics.latencies].sort((a, b) => a - b);
  const avg = ordered.length ? ordered.reduce((sum, value) => sum + value, 0) / ordered.length : 0;
  const p95 = ordered.length ? ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))] : 0;
  setText('metricStatus', '正常');
  setText('metricLatency', `${avg.toFixed(2)} ms`);
  setText('metricAlerts', localMetrics.highRiskAlerts);
  setText('metricRejects', localMetrics.rejections);
  setText('metricTotal', localMetrics.totalRequests);
  setText('metricP95', `${p95.toFixed(2)} ms`);
  setText('metricModel', (window.SmartCheckEngine && window.SmartCheckEngine.MODEL_VERSION) || 'pages-static');
  setText('metricErrors', localMetrics.errorCount);

  const status = $('systemStatus');
  status.className = 'status-pill';
  status.replaceChildren();
  status.append(document.createElement('i'), document.createTextNode(`纯静态版 · 本地计算 · ${localMetrics.totalRequests} 次评估`));
  renderLogs(localMetrics.logs.slice(0, 12));
}

function renderLogs(items) {
  const body = $('logTableBody');
  body.replaceChildren();
  if (!items.length) {
    const row = document.createElement('tr');
    const cell = createElement('td', 'table-empty', '暂无请求日志');
    cell.colSpan = 7;
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('tr');
    const level = safeLevel(item.warning_level);
    const levelClass = { blue: 'mini-blue', yellow: 'mini-yellow', orange: 'mini-orange', red: 'mini-red' }[level];
    const warningCell = document.createElement('td');
    if (item.low_confidence) {
      // 审计日志：明确标注"已拒答/待人工复核"；原始预警值用中性灰徽标保留，避免被误认为当前最终状态
      warningCell.appendChild(createElement('span', 'mini-badge mini-reject', '已拒答'));
      warningCell.appendChild(document.createTextNode(' '));
      warningCell.appendChild(createElement('span', 'mini-badge mini-review', '待人工复核'));
      warningCell.appendChild(document.createTextNode(' '));
      warningCell.appendChild(createElement('span', 'mini-badge mini-neutral', '规则引擎原始输出：' + item.warning_label));
    } else {
      warningCell.appendChild(createElement('span', `mini-badge ${levelClass}`, item.warning_label));
    }
    const confidenceCell = document.createElement('td');
    confidenceCell.textContent = `${Math.round(item.confidence * 100)}% 置信度`;
    const reviewCell = document.createElement('td');
    reviewCell.appendChild(createElement('span', `mini-badge ${item.requires_human_review ? 'mini-review' : 'mini-safe'}`, item.requires_human_review ? '需要' : '否'));
    row.append(
      createElement('td', '', item.time),
      createElement('td', '', item.request_id),
      warningCell,
      confidenceCell,
      createElement('td', '', `${item.data_quality}/100`),
      createElement('td', '', `${item.latency_ms} ms`),
      reviewCell
    );
    body.appendChild(row);
  });
}

function clearForm() {
  form.reset();
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
  form.querySelectorAll('[data-test]').forEach((select) => { select.value = 'unknown'; });
  document.querySelectorAll('.preset-button').forEach((button) => button.classList.remove('active'));
  currentResult = null;
  resultContent.hidden = true;
  resultContent.replaceChildren();
  emptyState.hidden = false;
  showToast('表单已清空，所有计算仅在本机浏览器内完成。');
}

function bindEvents() {
  form.addEventListener('submit', submitScreening);
  $('clearButton').addEventListener('click', clearForm);
  $('refreshButton').addEventListener('click', refreshObservability);
  document.querySelectorAll('.preset-button').forEach((button) => {
    button.addEventListener('click', () => activatePreset(button.dataset.preset));
  });
}

function init() {
  bindEvents();
  loadSamples();
  refreshObservability();
  setInterval(refreshObservability, 8000);
}

init();

