/*
 * 规则引擎回归测试基线（任务C）
 *
 * 运行方式（唯一命令，无需任何第三方依赖）：
 *     node tests/engine-baseline.js
 *
 * 作用：
 *   只读加载 docs/engine.js（不修改、不覆盖），对内置四个样本
 *   （dengue / flu / nipah / insufficient）断言关键输出字段，
 *   防止后续改动静默改变风险分、预警等级、拒答或人工复核状态。
 *
 * 期望值来源：
 *   2026-10-13 对 docs/engine.js（SHA-256 acf7b177...）的实际运行结果，
 *   详细快照见 outputs/audit/engine-baseline.json。
 *
 * 排除的非确定性字段：
 *   request_id、generated_at、latency_ms（每次运行都不同，不参与比较）。
 *
 * 若确属有意修改引擎行为，请先更新下方 EXPECTED，并在提交说明中写明原因。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_PATH = path.join(ROOT, 'docs', 'engine.js');

const MODEL_NAME = '通检智防浏览器端可解释评分引擎';
const MODEL_VERSION = 'pages-engine-1.0.0';

const EXPECTED = {
  dengue: {
    risk_score: 84, warning_level: 'orange', warning_label: '橙色预警', risk_label: '高风险',
    data_quality: 100, confidence: 0.86, low_confidence: false, requires_human_review: true,
    stage: '急性早期', severity: '低', severity_score: 10,
    pathogens: ['登革热:100', '基孔肯雅热:40', '寨卡病毒病:27'],
    pathogen_count: 5, evidence_count: 10, trace_steps: 7
  },
  flu: {
    risk_score: 56, warning_level: 'yellow', warning_label: '黄色预警', risk_label: '关注风险',
    data_quality: 100, confidence: 0.86, low_confidence: false, requires_human_review: false,
    stage: '急性早期', severity: '低', severity_score: 0,
    pathogens: ['流感:72', '新冠病毒感染:29', '登革热:15'],
    pathogen_count: 5, evidence_count: 10, trace_steps: 7
  },
  nipah: {
    risk_score: 74, warning_level: 'red', warning_label: '红色预警', risk_label: '极高风险',
    data_quality: 96, confidence: 0.852, low_confidence: false, requires_human_review: true,
    stage: '急性早期', severity: '极高', severity_score: 86,
    pathogens: ['尼帕病毒病:62', '新冠病毒感染:31', '乙型脑炎:29'],
    pathogen_count: 5, evidence_count: 10, trace_steps: 7
  },
  insufficient: {
    risk_score: 0, warning_level: 'yellow', warning_label: '黄色预警', risk_label: '关注风险',
    data_quality: 53, confidence: 0.5, low_confidence: true, requires_human_review: true,
    stage: '无法判断', severity: '低', severity_score: 0,
    pathogens: ['其他发热症候群:10'],
    pathogen_count: 1, evidence_count: 0, trace_steps: 7
  }
};

/* ---------- 只读加载引擎（与线上完全相同的文件） ---------- */

const code = fs.readFileSync(ENGINE_PATH, 'utf8');
global.window = {};
global.performance = global.performance || performance;
global.document = { getElementById: () => null };
vm.runInThisContext(code, { filename: 'docs/engine.js' });

const engine = global.window.SmartCheckEngine;

/* ---------- 断言工具 ---------- */

const failures = [];
let checks = 0;

function check(label, expected, actual) {
  checks += 1;
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  if (e !== a) failures.push({ label, expected: e, actual: a });
}

function pick(result) {
  return {
    risk_score: result.risk.score,
    warning_level: result.risk.warning_level,
    warning_label: result.risk.warning_label,
    risk_label: result.risk.label,
    data_quality: result.data_quality.score,
    confidence: result.trust.confidence,
    low_confidence: result.trust.low_confidence,
    requires_human_review: result.trust.requires_human_review,
    stage: result.stage.label,
    severity: result.severity.label,
    severity_score: result.severity.score,
    pathogens: result.pathogens.slice(0, 3).map((p) => p.name + ':' + p.score),
    pathogen_count: result.pathogens.length,
    evidence_count: result.risk.evidence.length,
    trace_steps: result.trace.length
  };
}

function stripVolatile(result) {
  const copy = JSON.parse(JSON.stringify(result));
  delete copy.request_id;
  delete copy.generated_at;
  delete copy.latency_ms;
  return JSON.stringify(copy);
}

/* ---------- 运行 ---------- */

console.log('引擎文件：docs/engine.js');
console.log('模型标识：' + (engine && engine.MODEL_NAME) + ' / ' + (engine && engine.MODEL_VERSION));
console.log('');

check('engine.MODEL_NAME', MODEL_NAME, engine && engine.MODEL_NAME);
check('engine.MODEL_VERSION', MODEL_VERSION, engine && engine.MODEL_VERSION);

const sampleNames = Object.keys(EXPECTED);
const availableSamples = engine && engine.SAMPLES ? Object.keys(engine.SAMPLES) : [];

sampleNames.forEach((name) => {
  check('SAMPLES.' + name + ' 存在', true, availableSamples.indexOf(name) !== -1);
});

sampleNames.forEach((name) => {
  const payload = engine && engine.SAMPLES ? engine.SAMPLES[name] : null;
  if (!payload) {
    failures.push({ label: name + ' 无法运行', expected: '存在样本', actual: '缺失' });
    return;
  }

  const run1 = engine.assess(JSON.parse(JSON.stringify(payload)));
  const run2 = engine.assess(JSON.parse(JSON.stringify(payload)));

  // 1) 同一输入两次运行必须一致（排除 request_id / generated_at / latency_ms）
  check(name + '.确定性(两次运行一致)', stripVolatile(run1), stripVolatile(run2));

  // 2) 关键字段逐项断言
  const actual = pick(run1);
  Object.keys(EXPECTED[name]).forEach((key) => {
    check(name + '.' + key, EXPECTED[name][key], actual[key]);
  });

  const ok = failures.every((f) => !f.label.startsWith(name + '.'));
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name.padEnd(13)
    + ' 风险分=' + actual.risk_score + '/99'
    + ' 预警=' + actual.warning_label
    + ' 置信度=' + Math.round(actual.confidence * 100) + '%'
    + ' 拒答=' + (actual.low_confidence ? '是' : '否')
    + ' 转人工=' + (actual.requires_human_review ? '是' : '否'));
});

/* ---------- 结果 ---------- */

console.log('');
console.log('断言项：' + checks + '，失败：' + failures.length);

if (failures.length) {
  console.log('');
  console.log('===== 回归差异 =====');
  failures.forEach((f) => {
    console.log('FAIL ' + f.label);
    console.log('     期望: ' + f.expected);
    console.log('     实际: ' + f.actual);
  });
  console.log('');
  console.log('结果：失败（存在回归或期望值已过期）');
  process.exit(1);
}

console.log('结果：通过（4/4 样本，关键字段与基线一致）');
process.exit(0);
