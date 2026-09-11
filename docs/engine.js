(function () {
  'use strict';

  const MODEL_NAME = '通检智防浏览器端可解释评分引擎';
  const MODEL_VERSION = 'pages-engine-1.0.0';
  const ASEAN_REGIONS = ['越南','泰国','新加坡','马来西亚','印度尼西亚','菲律宾','柬埔寨','老挝','缅甸','文莱','东帝汶','vietnam','thailand','singapore','malaysia','indonesia','philippines','cambodia','laos','myanmar','brunei','timor-leste'];
  const INCUBATION = {
    '登革热':[4,10], '基孔肯雅热':[3,7], '寨卡病毒病':[3,14], '乙型脑炎':[5,15], '尼帕病毒病':[4,14],
    '肠道病毒 71 型感染':[3,7], '流感':[1,4], '新冠病毒感染':[2,14], '麻疹':[7,21], '猴痘':[5,21]
  };
  const TEST_LABELS = {
    dengue_ns1:'登革 NS1 抗原', dengue_igm:'登革 IgM', chikungunya_pcr:'基孔肯雅 RT-PCR', zika_pcr:'寨卡 RT-PCR', je_igm:'乙脑 IgM',
    influenza_a:'甲型流感抗原', influenza_b:'乙型流感抗原', covid_antigen:'新冠抗原', measles_igm:'麻疹 IgM', mpox_pcr:'猴痘 PCR'
  };
  const RECOMMENDATIONS = {
    '登革热':['登革 NS1 抗原','登革 IgM/IgG','血常规与血小板动态复测'],
    '基孔肯雅热':['基孔肯雅 RT-PCR','基孔肯雅 IgM','关节症状临床评估'],
    '寨卡病毒病':['寨卡 RT-PCR','寨卡 IgM','孕产妇重点评估'],
    '乙型脑炎':['乙脑 IgM','神经系统评估','必要时脑脊液检查'],
    '尼帕病毒病':['尼帕病毒核酸检测','立即隔离并报告','高等级防护下转诊'],
    '肠道病毒 71 型感染':['EV71 核酸检测','手足口病临床评估','重症神经系统观察'],
    '流感':['流感 A/B 抗原或核酸','血常规与炎症指标','必要时胸部影像'],
    '新冠病毒感染':['新冠病毒核酸/抗原','血氧监测','必要时胸部影像'],
    '麻疹':['麻疹 IgM/核酸','隔离与接触者调查','疫苗与暴露史核实'],
    '猴痘':['猴痘病毒 PCR','皮损与接触史评估','隔离与报告评估']
  };
  const WARNING_META = {
    blue:{label:'蓝色预警',risk:'低风险',summary:'当前未见明确高风险证据，建议常规通行并做好健康提示。'},
    yellow:{label:'黄色预警',risk:'关注风险',summary:'存在需要关注的风险信号，建议补充问询、检测或入境后随访。'},
    orange:{label:'橙色预警',risk:'高风险',summary:'存在较高感染或进展风险，建议尽快检测并由专业人员进行临床评估。'},
    red:{label:'红色预警',risk:'极高风险',summary:'存在紧急危险信号或高后果病原可能，应立即启动人工复核和应急处置流程。'}
  };

  function section(payload, name) { const value = payload && payload[name]; return value && typeof value === 'object' ? value : {}; }
  function num(value) { if (value === null || value === undefined || value === '') return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
  function truthy(value) { return value === true || ['1','true','yes','y','on','是','有','阳性'].includes(String(value || '').toLowerCase()); }
  function testStatus(value) { const text = String(value || 'unknown').toLowerCase(); if (['positive','pos','阳性','1','true','是','有'].includes(text)) return 'positive'; if (['negative','neg','阴性','0','false','否','无'].includes(text)) return 'negative'; return 'unknown'; }
  function dedupe(items) { return Array.from(new Set(items.filter(Boolean))); }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }

  function quality(payload) {
    const person=section(payload,'person'), travel=section(payload,'travel'), symptoms=section(payload,'symptoms'), vitals=section(payload,'vitals'), labs=section(payload,'labs'), tests=section(payload,'tests');
    let score=100; const issues=[];
    if (num(person.age) === null) { score-=8; issues.push('缺少年龄'); }
    if (!String(person.nationality || person.origin || '').trim()) { score-=4; issues.push('缺少来源地/国籍信息'); }
    if (num(travel.days_since_exposure) === null) { score-=10; issues.push('缺少可能暴露后的天数'); }
    if (!String(travel.visited_countries || travel.destination || '').trim()) { score-=5; issues.push('缺少旅行目的地'); }
    if (num(vitals.temperature) === null) { score-=10; issues.push('缺少体温'); }
    if (num(vitals.spo2) === null) { score-=5; issues.push('缺少血氧'); }
    if (truthy(symptoms.fever) && num(symptoms.onset_days) === null) { score-=8; issues.push('有发热但缺少症状开始天数'); }
    const symptomKeys=['fever','rash','joint_pain','headache','retroorbital_pain','myalgia','vomiting','diarrhea','bleeding','confusion','cough','sore_throat','breathing_difficulty','conjunctivitis','lymphadenopathy','hand_foot_mouth'];
    if (!symptomKeys.some((key) => truthy(symptoms[key]))) { score-=10; issues.push('未录入任何症状'); }
    if (Object.keys(TEST_LABELS).every((key) => testStatus(tests[key]) === 'unknown')) { score-=4; issues.push('尚无现场检测结果'); }
    if (num(labs.platelets) === null && num(labs.wbc) === null) { score-=3; issues.push('缺少基础实验室指标'); }
    score=clamp(score,0,100);
    const label=score>=85?'良好':score>=65?'可用':score>=40?'偏低':'不足';
    return {score,label,issues};
  }

  function riskAndPathogens(payload) {
    const person=section(payload,'person'), travel=section(payload,'travel'), symptoms=section(payload,'symptoms'), vitals=section(payload,'vitals'), labs=section(payload,'labs'), tests=section(payload,'tests');
    let riskPoints=0; const riskEvidence=[]; const pathogenPoints={}; const pathogenEvidence={};
    function risk(points,text){ riskPoints+=points; riskEvidence.push(text); }
    function add(name,points,text){ pathogenPoints[name]=(pathogenPoints[name]||0)+points; (pathogenEvidence[name]=pathogenEvidence[name]||[]).push(text); }
    const age=num(person.age), exposureDays=num(travel.days_since_exposure), onsetDays=num(symptoms.onset_days), temperature=num(vitals.temperature), heartRate=num(vitals.heart_rate), respiratoryRate=num(vitals.respiratory_rate), systolic=num(vitals.systolic_bp), spo2=num(vitals.spo2), wbc=num(labs.wbc), platelets=num(labs.platelets), crp=num(labs.crp), alt=num(labs.alt), ast=num(labs.ast);
    const visited=String(travel.visited_countries||travel.destination||'').toLowerCase();
    const isASEAN=ASEAN_REGIONS.some((region)=>visited.includes(region.toLowerCase()));
    const mosquito=truthy(travel.mosquito_exposure), animal=truthy(travel.animal_contact), crowded=truthy(travel.crowded_setting), sickContact=truthy(travel.sick_contact), rural=truthy(travel.rural_or_farm);

    if(isASEAN) risk(5,'有东盟地区旅行史'); if(mosquito) risk(10,'存在蚊虫叮咬暴露'); if(animal) risk(8,'存在动物或生鲜市场暴露'); if(sickContact) risk(6,'存在发热/呼吸道患者接触史'); if(crowded) risk(3,'曾处于人员密集环境'); if(rural) risk(4,'有乡村、养殖或农田暴露'); if(exposureDays!==null&&exposureDays>=1&&exposureDays<=21) risk(5,`处于常见传染病暴露后观察窗口（${exposureDays} 天）`);

    const symptomMap={fever:['发热',12,['登革热','基孔肯雅热','寨卡病毒病','乙型脑炎','尼帕病毒病','肠道病毒 71 型感染','流感','新冠病毒感染','麻疹','猴痘'],8],rash:['皮疹',7,['登革热','寨卡病毒病','麻疹','猴痘'],8],headache:['头痛',3,['登革热','基孔肯雅热','寨卡病毒病','乙型脑炎','尼帕病毒病'],3],retroorbital_pain:['眼后疼痛',4,['登革热'],9],myalgia:['肌肉酸痛',3,['登革热','流感'],4],vomiting:['呕吐',4,['登革热','尼帕病毒病'],3],diarrhea:['腹泻',2,['肠道病毒 71 型感染'],3],bleeding:['出血表现',12,['登革热'],14],confusion:['意识改变',12,['乙型脑炎','尼帕病毒病'],18],cough:['咳嗽',3,['流感','新冠病毒感染','麻疹'],6],sore_throat:['咽痛',2,['流感','新冠病毒感染'],5],breathing_difficulty:['呼吸困难',10,['尼帕病毒病','新冠病毒感染','流感'],6],conjunctivitis:['结膜充血',3,['寨卡病毒病','麻疹'],8],lymphadenopathy:['淋巴结肿大',4,['猴痘'],14],hand_foot_mouth:['手足口皮疹或口腔疱疹',8,['肠道病毒 71 型感染'],24]};
    Object.entries(symptomMap).forEach(([key,[label,riskScore,pathogens,pathScore]])=>{ if(truthy(symptoms[key])){ risk(riskScore,label); pathogens.forEach((name)=>add(name,pathScore,label)); } });
    if(truthy(symptoms.joint_pain)){ risk(7,'关节疼痛'); add('基孔肯雅热',16,'明显关节疼痛'); add('登革热',5,'关节疼痛'); }

    if(temperature!==null){ if(temperature>=40) risk(14,`体温 ${temperature}℃`); else if(temperature>=38) risk(8,`体温 ${temperature}℃`); else if(temperature<35) risk(6,`低体温 ${temperature}℃`); }
    if(heartRate!==null&&heartRate>100) risk(4,`心率增快 ${heartRate} 次/分`);
    if(respiratoryRate!==null){ if(respiratoryRate>=30) risk(10,`呼吸频率 ${respiratoryRate} 次/分`); else if(respiratoryRate>22) risk(5,`呼吸频率 ${respiratoryRate} 次/分`); }
    if(spo2!==null){ if(spo2<90) risk(20,`血氧 ${spo2}%`); else if(spo2<95) risk(11,`血氧偏低 ${spo2}%`); }
    if(systolic!==null&&systolic<90) risk(16,`收缩压 ${systolic} mmHg`);
    if(wbc!==null&&wbc<4){ risk(5,`白细胞降低 ${wbc}×10⁹/L`); add('登革热',6,'白细胞降低'); }
    if(platelets!==null){ if(platelets<50){risk(18,`血小板显著降低 ${platelets}×10⁹/L`);add('登革热',16,'血小板显著降低');} else if(platelets<100){risk(12,`血小板降低 ${platelets}×10⁹/L`);add('登革热',11,'血小板降低');} else if(platelets<150){risk(7,`血小板偏低 ${platelets}×10⁹/L`);add('登革热',6,'血小板偏低');} }
    if(crp!==null&&crp>10){ risk(4,`CRP 升高 ${crp}`); add('流感',3,'CRP 升高'); add('新冠病毒感染',3,'CRP 升高'); }
    if(alt!==null&&alt>80){ risk(4,`ALT 升高 ${alt} U/L`); add('登革热',2,'ALT 升高'); }
    if(ast!==null&&ast>80){ risk(4,`AST 升高 ${ast} U/L`); add('登革热',2,'AST 升高'); }

    Object.keys(TEST_LABELS).forEach((key)=>{ if(testStatus(tests[key])==='positive'){ const label=TEST_LABELS[key]; risk(24,`${label}阳性`); const map={dengue_ns1:['登革热',38],dengue_igm:['登革热',38],chikungunya_pcr:['基孔肯雅热',42],zika_pcr:['寨卡病毒病',42],je_igm:['乙型脑炎',40],influenza_a:['流感',38],influenza_b:['流感',38],covid_antigen:['新冠病毒感染',38],measles_igm:['麻疹',42],mpox_pcr:['猴痘',44]}; add(map[key][0],map[key][1],`${label}阳性`); } });
    if(exposureDays!==null){ if(exposureDays>=3&&exposureDays<=14&&mosquito){['登革热','基孔肯雅热','寨卡病毒病'].forEach((name)=>add(name,8,`蚊媒暴露与 ${exposureDays} 天时间窗相符`));} if(exposureDays>=4&&exposureDays<=14&&animal) add('尼帕病毒病',12,'动物暴露与潜伏期时间窗相符'); if(exposureDays>=1&&exposureDays<=4&&crowded) add('流感',8,'人员密集暴露与短潜伏期相符'); if(exposureDays>=2&&exposureDays<=14&&sickContact) add('新冠病毒感染',7,'患者接触史与潜伏期相符'); if(exposureDays>=7&&exposureDays<=21&&truthy(symptoms.rash)) add('麻疹',7,'皮疹与 7—21 天时间窗相符'); if(exposureDays>=5&&exposureDays<=21&&sickContact) add('猴痘',7,'密切接触与 5—21 天时间窗相符'); }
    if(age!==null&&age<=5&&truthy(symptoms.hand_foot_mouth)) add('肠道病毒 71 型感染',18,'5 岁及以下儿童合并手足口表现');
    if(truthy(symptoms.fever)&&truthy(symptoms.rash)&&truthy(symptoms.joint_pain)){add('登革热',6,'发热+皮疹+关节痛组合');add('基孔肯雅热',5,'发热+皮疹+关节痛组合');}
    if(truthy(symptoms.fever)&&truthy(symptoms.rash)&&truthy(symptoms.conjunctivitis)) add('寨卡病毒病',9,'发热+皮疹+结膜充血组合');
    if(truthy(symptoms.fever)&&truthy(symptoms.confusion)&&animal) add('尼帕病毒病',12,'发热+意识改变+动物暴露');
    if(truthy(symptoms.fever)&&truthy(symptoms.cough)&&truthy(symptoms.breathing_difficulty)){add('新冠病毒感染',8,'发热+咳嗽+呼吸困难组合');add('流感',6,'发热+咳嗽+呼吸困难组合');}

    if(!Object.keys(pathogenPoints).length){pathogenPoints['其他发热症候群']=10;pathogenEvidence['其他发热症候群']=['信息有限，暂按非特异性发热症候群管理'];}
    const riskScore=clamp(Math.round(riskPoints*0.72),0,99);
    const ranked=Object.entries(pathogenPoints).sort((a,b)=>b[1]-a[1]);
    const denominator=ranked.reduce((sum,[,score])=>sum+Math.exp(Math.min(12,score/18)),0)||1;
    const pathogens=ranked.slice(0,5).map(([name,raw])=>({name,score:clamp(Math.round(raw),0,100),relative_share:Number((Math.exp(Math.min(12,raw/18))/denominator).toFixed(3)),evidence:(pathogenEvidence[name]||[]).slice(0,6)}));
    return {riskScore,pathogens,riskEvidence:dedupe(riskEvidence).slice(0,10)};
  }

  function severity(payload) {
    const person=section(payload,'person'), symptoms=section(payload,'symptoms'), vitals=section(payload,'vitals'), labs=section(payload,'labs');
    let score=0; const flags=[]; const age=num(person.age), temperature=num(vitals.temperature), respiratoryRate=num(vitals.respiratory_rate), systolic=num(vitals.systolic_bp), spo2=num(vitals.spo2), platelets=num(labs.platelets);
    if(temperature!==null&&temperature>=40){score+=10;flags.push('超高热');}
    if(respiratoryRate!==null){if(respiratoryRate>=30){score+=15;flags.push('呼吸频率≥30次/分');}else if(respiratoryRate>22){score+=7;flags.push('呼吸频率增快');}}
    if(spo2!==null){if(spo2<90){score+=30;flags.push('血氧<90%');}else if(spo2<95){score+=16;flags.push('血氧<95%');}}
    if(systolic!==null&&systolic<90){score+=25;flags.push('收缩压<90mmHg');}
    if(truthy(symptoms.confusion)){score+=25;flags.push('意识改变');}
    if(truthy(symptoms.bleeding)){score+=22;flags.push('出血表现');}
    if(truthy(symptoms.breathing_difficulty)){score+=15;flags.push('呼吸困难');}
    if(truthy(symptoms.vomiting)){score+=5;flags.push('呕吐');}
    if(platelets!==null){if(platelets<50){score+=20;flags.push('血小板<50×10⁹/L');}else if(platelets<100){score+=10;flags.push('血小板<100×10⁹/L');}}
    if(age!==null&&(age<=5||age>=65)){score+=8;flags.push('年龄极端人群');}
    if(truthy(person.chronic_disease)){score+=10;flags.push('基础疾病');}
    if(truthy(person.pregnancy)){score+=12;flags.push('妊娠状态');}
    const level=score>=60?'critical':score>=35?'high':score>=15?'moderate':'low';
    const label=score>=60?'极高':score>=35?'较高':score>=15?'中等':'低';
    return {score:Math.min(100,score),level,label,flags:flags.length?flags:['未发现明确重症危险信号']};
  }

  function stage(payload, topPathogen) {
    const travel=section(payload,'travel'), symptoms=section(payload,'symptoms'); const exposureDays=num(travel.days_since_exposure), onsetDays=num(symptoms.onset_days), incubation=INCUBATION[topPathogen]||[2,14];
    if(exposureDays===null&&onsetDays===null) return {label:'无法判断',window:'证据不足',confidence:'低',detail:'缺少暴露时间或症状开始时间，不输出精确感染时长。'};
    if(onsetDays!==null){let label,window,confidence;if(onsetDays<=3){label='急性早期';window='症状出现后 0—3 天';confidence='中';}else if(onsetDays<=7){label='急性进展观察期';window='症状出现后 4—7 天';confidence='中';}else if(onsetDays<=14){label='病程中期/恢复观察期';window='症状出现后 8—14 天';confidence='中';}else{label='恢复期或非急性期';window='症状出现后超过 14 天';confidence='低';}return {label,window,confidence,detail:`依据症状开始时间估计；${topPathogen}常见潜伏期约为 ${incubation[0]}—${incubation[1]} 天。该结果用于风险分层，不等同于精确感染天数。`};}
    if(exposureDays>=incubation[0]&&exposureDays<=incubation[1]) return {label:'潜伏期/暴露后观察期',window:`暴露后 ${exposureDays} 天，处于常见潜伏期范围内`,confidence:'中',detail:`${topPathogen}常见潜伏期约为 ${incubation[0]}—${incubation[1]} 天，建议结合症状和检测动态复评。`};
    if(exposureDays<incubation[0]) return {label:'早期暴露观察',window:`暴露后 ${exposureDays} 天，尚未进入多数病例的高概率发病窗口`,confidence:'中',detail:'阴性快检不能排除后续发病，建议按随访时限复测。'};
    return {label:'超过常见潜伏期',window:`暴露后 ${exposureDays} 天`,confidence:'低',detail:'若仍无症状，急性感染可能性相对下降；若有症状，应结合病原谱扩大检测。'};
  }

  function confidence(qualityResult,pathogens) { if(!pathogens.length)return 0.2; const top=pathogens[0].score, second=pathogens[1]?pathogens[1].score:0, margin=Math.max(0,top-second); let value=0.38+qualityResult.score/500+Math.min(0.18,top/300)+Math.min(0.10,margin/120); if(top<20||qualityResult.score<60) value=Math.min(value,0.50); return Number(clamp(value,0.20,0.95).toFixed(3)); }
  function warning(riskScore,severityResult,pathogens,qualityResult,confidenceValue){const top=pathogens[0]||{name:'未知',score:0};const highConsequence=['尼帕病毒病','乙型脑炎','猴痘'].includes(top.name);const severe=['high','critical'].includes(severityResult.level);const lowConfidence=confidenceValue<0.55||qualityResult.score<45;if(severityResult.level==='critical'||(highConsequence&&severe))return {level:'red',lowConfidence,rejectReason:'存在紧急危险信号或高后果病原风险'};if(riskScore>=65||severe||(highConsequence&&top.score>=45))return {level:'orange',lowConfidence,rejectReason:null};if(lowConfidence)return {level:'yellow',lowConfidence,rejectReason:'关键信息不足或候选证据差异不明显，系统拒绝给出确定性判断'};if(riskScore>=28||top.score>=30)return {level:'yellow',lowConfidence:false,rejectReason:null};return {level:'blue',lowConfidence:false,rejectReason:null};}
  function recommendations(level,pathogens,lowConfidence){const tests=[];pathogens.slice(0,3).forEach((p)=>tests.push(...(RECOMMENDATIONS[p.name]||[])));if(lowConfidence)tests.unshift('建议按发热伴皮疹/呼吸道/神经症状症候群扩大检测');const actions={blue:['常规通行','提供多语言健康提示','如出现症状及时主动申报'],yellow:['补充问询与复测','安排现场快检或入境后健康随访','记录症状变化与联系方式'],orange:['尽快完成重点病原检测','由医务人员进行临床评估','评估隔离、报告和转运准备'],red:['立即启动人工复核和应急预案','做好个人防护与临时隔离','同步报告疾控并评估转运']}[level];const follow={blue:'无需特殊随访；出现新症状时复评。',yellow:'建议 24—48 小时内随访，若症状加重立即就医。',orange:'建议 24 小时内完成专业评估，并动态复测血氧、血小板等指标。',red:'立即进入应急处置流程，不得等待系统二次判断。'}[level];return {tests:dedupe(tests).slice(0,6),actions,follow_up:follow};}
  function requestId(){if(window.crypto&&window.crypto.getRandomValues){const a=new Uint8Array(6);window.crypto.getRandomValues(a);return Array.from(a).map((b)=>b.toString(16).padStart(2,'0')).join('');}return Math.random().toString(16).slice(2,14);}

  function assess(payload) {
    const started=performance.now(); const qualityResult=quality(payload); const scored=riskAndPathogens(payload); const severityResult=severity(payload); const confidenceValue=confidence(qualityResult,scored.pathogens); const warningResult=warning(scored.riskScore,severityResult,scored.pathogens,qualityResult,confidenceValue); const meta=WARNING_META[warningResult.level]; const topPathogen=scored.pathogens[0]?scored.pathogens[0].name:'其他发热症候群'; const stageResult=stage(payload,topPathogen); const recs=recommendations(warningResult.level,scored.pathogens,warningResult.lowConfidence); const highConsequence=['尼帕病毒病','乙型脑炎','猴痘'].includes(topPathogen); const requiresReview=['orange','red'].includes(warningResult.level)||warningResult.lowConfidence||highConsequence;
    const guardrails=[
      {name:'知识约束',status:'pass',detail:'候选病原由审核知识规则与输入证据生成，不依赖自由生成。'},
      {name:'不确定性闸门',status:warningResult.lowConfidence?'review':'pass',detail:warningResult.rejectReason||'候选证据差异达到可用阈值。'},
      {name:'人在回路',status:requiresReview?'review':'pass',detail:'高风险、低置信度或高后果病原必须由专业人员复核。'},
      {name:'可解释证据链',status:'pass',detail:'输出风险因素、候选排序和不确定性来源。'},
      {name:'隐私最小化',status:'pass',detail:'本静态页面完全在浏览器本地计算，不向服务器上传原始输入。'},
      {name:'禁止自动处置',status:'pass',detail:'系统不自动作出诊断、隔离或转运决定。'}
    ];
    const trace=[{step:'输入标准化',status:'pass',detail:`数据质量 ${qualityResult.score}/100`},{step:'流行病学风险评分',status:'pass',detail:`风险指数 ${scored.riskScore}/99`},{step:'病原候选排序',status:'pass',detail:`首位：${topPathogen}`},{step:'病程阶段推断',status:'pass',detail:stageResult.label},{step:'严重程度评估',status:'pass',detail:`${severityResult.label}风险`},{step:'不确定性校准',status:warningResult.lowConfidence?'review':'pass',detail:`置信度 ${Math.round(confidenceValue*100)}%`},{step:'分层预警生成',status:'pass',detail:meta.label}];
    return {request_id:requestId(),generated_at:new Date().toISOString(),model:{name:MODEL_NAME,version:MODEL_VERSION,mode:'浏览器端可解释规则评分'},latency_ms:Number((performance.now()-started).toFixed(2)),data_quality:qualityResult,risk:{score:scored.riskScore,label:meta.risk,warning_level:warningResult.level,warning_label:meta.label,summary:meta.summary,evidence:scored.riskEvidence},pathogens:scored.pathogens,stage:stageResult,severity:severityResult,recommendations:recs,trust:{confidence:confidenceValue,confidence_label:confidenceValue>=0.75?'较高':confidenceValue>=0.55?'中等':'较低',low_confidence:warningResult.lowConfidence,reject_reason:warningResult.rejectReason,requires_human_review:requiresReview,guardrails},trace,disclaimer:'本系统为项目原型与决策辅助演示，不构成医学诊断。筛查结果必须结合临床评估、实验室确证和专业公共卫生判断。'};
  }

  const unknownTests=()=>({dengue_ns1:'unknown',dengue_igm:'unknown',chikungunya_pcr:'unknown',zika_pcr:'unknown',je_igm:'unknown',influenza_a:'unknown',influenza_b:'unknown',covid_antigen:'unknown',measles_igm:'unknown',mpox_pcr:'unknown'});
  const baseSymptoms=(overrides={})=>Object.assign({fever:false,onset_days:'',rash:false,joint_pain:false,headache:false,retroorbital_pain:false,myalgia:false,vomiting:false,diarrhea:false,bleeding:false,confusion:false,cough:false,sore_throat:false,breathing_difficulty:false,conjunctivitis:false,lymphadenopathy:false,hand_foot_mouth:false},overrides);
  const SAMPLES={dengue:{person:{age:32,sex:'男',nationality:'中国',chronic_disease:false,pregnancy:false},travel:{visited_countries:'泰国、马来西亚',days_since_exposure:6,mosquito_exposure:true,animal_contact:false,crowded_setting:true,sick_contact:false,rural_or_farm:false},symptoms:baseSymptoms({fever:true,onset_days:2,rash:true,joint_pain:true,headache:true,retroorbital_pain:true,myalgia:true}),vitals:{temperature:39.1,heart_rate:104,respiratory_rate:20,systolic_bp:112,diastolic_bp:70,spo2:97},labs:{wbc:3.1,platelets:92,crp:18,alt:55,ast:62},tests:Object.assign(unknownTests(),{dengue_ns1:'positive',influenza_a:'negative',influenza_b:'negative',covid_antigen:'negative'})},flu:{person:{age:28,sex:'女',nationality:'新加坡',chronic_disease:false,pregnancy:false},travel:{visited_countries:'新加坡',days_since_exposure:2,mosquito_exposure:false,animal_contact:false,crowded_setting:true,sick_contact:true,rural_or_farm:false},symptoms:baseSymptoms({fever:true,onset_days:1,headache:true,myalgia:true,cough:true,sore_throat:true}),vitals:{temperature:38.2,heart_rate:92,respiratory_rate:18,systolic_bp:118,diastolic_bp:76,spo2:98},labs:{wbc:5.6,platelets:210,crp:12,alt:24,ast:28},tests:Object.assign(unknownTests(),{dengue_ns1:'negative',influenza_a:'positive',influenza_b:'negative',covid_antigen:'negative'})},insufficient:{person:{age:34,sex:'未说明',nationality:'中国',chronic_disease:false,pregnancy:false},travel:{visited_countries:'',days_since_exposure:null,mosquito_exposure:false,animal_contact:false,crowded_setting:false,sick_contact:false,rural_or_farm:false},symptoms:baseSymptoms(),vitals:{temperature:null,heart_rate:null,respiratory_rate:null,systolic_bp:null,diastolic_bp:null,spo2:null},labs:{wbc:null,platelets:null,crp:null,alt:null,ast:null},tests:unknownTests()},nipah:{person:{age:58,sex:'男',nationality:'中国',chronic_disease:true,pregnancy:false},travel:{visited_countries:'马来西亚、泰国',days_since_exposure:5,mosquito_exposure:false,animal_contact:true,crowded_setting:false,sick_contact:false,rural_or_farm:true},symptoms:baseSymptoms({fever:true,onset_days:3,headache:true,vomiting:true,confusion:true,cough:true,breathing_difficulty:true}),vitals:{temperature:39.6,heart_rate:112,respiratory_rate:31,systolic_bp:102,diastolic_bp:66,spo2:91},labs:{wbc:8.2,platelets:165,crp:38,alt:42,ast:48},tests:unknownTests()}};
  window.SmartCheckEngine={assess,SAMPLES,MODEL_NAME,MODEL_VERSION};
})();
