/**
 * Parses the user's counseling/clinical taxonomy into core-graph.seed.json.
 * Source of truth: the plan document; this file is the single encoding of the
 * taxonomy sections §1-1/§1-3/§1-4 (counseling), §2-1/§2-3/§2-4 (clinical),
 * and §3-1 (shared bridge hubs + cross-domain contrast descriptions).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Level = "top_hub" | "mid_hub" | "concept";
type Domain = "counseling" | "clinical" | "shared";
type Relation = "contains" | "related_to" | "prerequisite_of" | "example_of" | "contrasts_with" | "bridges_to";

interface Node { id: string; domain: Domain; level: Level; labelKo: string; labelEn?: string; description?: string; parentHubId?: string }
interface Edge { id: string; sourceId: string; targetId: string; relation: Relation; confidence?: number }
interface Path { id: string; title: string; kind: "seeded_template"; nodeSequence: string[] }

const nodes: Node[] = [];
const edges: Edge[] = [];

/**
 * Deterministic slug that keeps Hangul so concept ids are stable across reseeds
 * and seed-path nodeSequences actually resolve. Strips parens, dots, slashes,
 * collapses whitespace to underscore.
 */
const slug = (s: string) =>
  s.toLowerCase()
    .replace(/[·()\/\.]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_가-힣]/g, "")
    .replace(/^_|_$/g, "");

function hub(idPrefix: string, domain: Domain, labelKo: string, labelEn: string, description: string, concepts: string[]) {
  const hubId = `${idPrefix}_${slug(labelEn)}`;
  nodes.push({ id: hubId, domain, level: "top_hub", labelKo, labelEn, description });
  for (const c of concepts) {
    const conceptId = `${hubId}__${slug(c)}`;
    nodes.push({ id: conceptId, domain, level: "concept", labelKo: c, parentHubId: hubId });
    edges.push({ id: `e_${hubId}_contains_${conceptId}`, sourceId: hubId, targetId: conceptId, relation: "contains" });
  }
  return hubId;
}

/** Resolve a concept id by (hub, concept-ko). Throws if missing — fail loud so
 *  seed paths can't silently desync from the taxonomy again. */
function concept(hubId: string, conceptKo: string): string {
  const id = `${hubId}__${slug(conceptKo)}`;
  if (!nodes.find((n) => n.id === id)) {
    throw new Error(`seed: concept not found — ${id} (hub=${hubId}, ko=${conceptKo})`);
  }
  return id;
}

// ---------------- Counseling (§1-1, §1-3) ----------------
// description 문구는 §1-1 표의 "설명" 컬럼 원문.
const C = {
  dev:     hub("c", "counseling", "인간발달",       "human_development",
    "내담자 이해의 기초가 되는 발달적 틀",
    ["신체·인지·정서·사회성 발달", "청소년기 발달과업", "성인초기 발달", "정체성 형성", "자율성 발달"]),
  indiv:   hub("c", "counseling", "개인차",          "individual_differences",
    "사람마다 다른 비교적 안정적 특성",
    ["성격 특성", "기질", "자아개념", "자기효능감", "회복탄력성", "강점 기반 관점"]),
  problem: hub("c", "counseling", "문제영역",        "problem_areas",
    "상담이 다루는 주요 어려움과 주제 — 학생 탐색의 시작점 (§1-2)",
    ["학업문제", "진로문제", "정서문제", "대인관계문제", "행동문제", "학교폭력 관련 문제", "학교부적응", "가족 관련 문제"]),
  theory:  hub("c", "counseling", "상담이론",        "counseling_theories",
    "문제를 해석하고 개입하는 관점 — 같은 문제도 이론에 따라 다르게 해석 (§1-2)",
    ["인지행동치료(CBT)", "인간중심치료", "정신역동적 접근", "해결중심상담", "내러티브상담", "현실치료", "REBT", "애착 기반 관점"]),
  process: hub("c", "counseling", "상담과정",        "counseling_process",
    "상담이 진행되는 시간적 구조 — 기법이 아닌 관계·목표의 연속적 과정 (§1-2)",
    ["관계형성", "초기면담", "문제 명료화", "사정 및 개념화", "목표설정", "개입", "종결", "추수상담"]),
  skills:  hub("c", "counseling", "상담기술",        "counseling_skills",
    "상담자가 실제로 사용하는 미시적 행동",
    ["공감", "반영", "재진술", "개방형 질문", "명료화", "직면", "해석", "즉시성", "요약", "피드백"]),
  assess:  hub("c", "counseling", "평가 및 사정",    "counseling_assessment",
    "문제 파악과 의사결정을 위한 평가",
    ["면담", "행동관찰", "사례개념화", "정서평가", "성격평가", "학습 및 적응 평가", "진로흥미검사", "강점평가"]),
  context: hub("c", "counseling", "교육맥락",        "educational_context",
    "학교 및 교육 제도 안에서의 환경 변수 — 개인 내부 문제만이 아닌 맥락 상호작용 (§1-2)",
    ["학생", "교사", "부모", "또래", "학급", "학교조직", "학교문화", "상담실", "지역사회 연계"]),
  prevent: hub("c", "counseling", "예방 및 프로그램", "prevention_programs",
    "문제 발생 전후의 집단적 지원 체계",
    ["정서행동 예방교육", "사회정서학습(SEL)", "집단상담", "또래상담", "학업동기 프로그램", "진로교육 프로그램"]),
  career:  hub("c", "counseling", "진로 및 생애설계", "career_life_design",
    "교육상담에서 특히 강조되는 축 — 독립 허브로 둘 가치 (§1-2)",
    ["진로발달이론", "진로정체성", "직업흥미", "진로결정 자기효능감", "의사결정", "생애설계"]),
  multi:   hub("c", "counseling", "다문화·다양성",   "multicultural_diversity",
    "문화적 맥락과 차이를 반영하는 범주",
    ["문화적 정체성", "문화적 민감성", "사회경제적 배경", "장애와 접근성", "성별 및 다양성 이슈"]),
  ethics:  hub("c", "counseling", "윤리 및 전문성",  "ethics_professionalism",
    "상담 실행의 규범과 전문가 역할",
    ["비밀보장", "사전동의", "전문적 경계", "기록관리", "수퍼비전", "의뢰와 협력", "자기돌봄"]),
  outcome: hub("c", "counseling", "성과 및 변화",    "outcomes_change",
    "상담 결과와 변화 메커니즘",
    ["상담만족도", "자기이해 향상", "문제감소", "학교적응 향상", "의사결정 능력 향상"])
};

// ---------------- Clinical (§2-1, §2-3) ----------------
const L = {
  psychopath: hub("cl", "clinical", "정신병리",      "psychopathology",
    "임상심리의 핵심 대상 — 학생이 장애 체계를 분류적으로 이해하는 출발점 (§2-2)",
    ["우울장애", "불안장애", "강박 및 관련장애", "외상 및 스트레스 관련장애", "양극성장애",
      "조현병스펙트럼 및 기타 정신병적 장애", "성격장애", "신경발달장애", "섭식장애", "물질사용장애"]),
  symptoms:   hub("cl", "clinical", "증상 및 징후",  "symptoms_signs",
    "장애를 구성하는 관찰 가능/보고 가능 요소",
    ["우울기분", "무쾌감", "불안", "공황발작", "회피", "강박사고", "망상", "환각", "충동성", "주의집중곤란"]),
  etiology:   hub("cl", "clinical", "병인론",        "etiology",
    "장애의 원인을 설명하는 다층 구조",
    ["유전적 취약성", "신경전달물질 이상", "인지왜곡", "학습이력", "애착과 가족요인", "스트레스 사건", "사회문화적 요인"]),
  assess:     hub("cl", "clinical", "평가 및 진단",  "clinical_assessment",
    "진단적 판단과 사례이해를 위한 체계 — 체계적 사정·판단이 임상심리의 핵심 (§2-2)",
    ["임상면담", "구조화면담(SCID 등)", "행동평가", "자기보고식 검사", "투사검사",
      "지능검사(WAIS)", "성격검사(MMPI)", "우울/불안 척도", "신경심리검사"]),
  concept:    hub("cl", "clinical", "사례개념화",    "case_conceptualization",
    "내담자별 문제 구조의 통합적 이해 — 동일 진단도 촉발·유지·보호 요인이 다름 (§2-2)",
    ["주호소", "촉발요인", "유지요인", "보호요인", "공병", "기능수준", "치료목표"]),
  treatment:  hub("cl", "clinical", "치료접근",      "treatment_approaches",
    "장애나 문제에 적용되는 개입 체계",
    ["인지행동치료(CBT)", "변증법적 행동치료(DBT)", "수용전념치료(ACT)", "정신역동치료", "가족치료", "약물치료 협력"]),
  process:    hub("cl", "clinical", "치료과정",      "treatment_process",
    "치료가 진행되는 단계와 변화 과정",
    ["초기평가", "치료계획 수립", "치료동맹 형성", "중재 수행", "변화 모니터링", "재발예방", "종결"]),
  risk:       hub("cl", "clinical", "위험 및 위기관리", "risk_crisis",
    "응급성·자타해 위험·안전계획 — 독립 허브로 분리할 가치 (§2-2)",
    ["자살사고", "자해", "타해위험", "위기평가", "안전계획", "응급의뢰"]),
  neuro:      hub("cl", "clinical", "신경심리 및 생물학적 기초", "neuro_biological",
    "뇌, 인지 기능, 생물학적 기반",
    ["주의", "기억", "실행기능", "뇌손상", "신경발달", "생리적 각성"]),
  lifespan:   hub("cl", "clinical", "발달 및 생애주기", "lifespan_clinical",
    "연령에 따른 임상 양상의 변화",
    ["아동청소년 임상", "성인 임상", "노인 임상", "발달단계에 따른 증상 표현"]),
  ethics:     hub("cl", "clinical", "윤리 및 법적 이슈", "clinical_ethics_legal",
    "임상 실천의 규범과 법적 책임",
    ["사전동의", "비밀보장과 예외", "기록관리", "의무보고", "전문적 경계", "협진과 의뢰"]),
  multi:      hub("cl", "clinical", "다문화·다양성", "clinical_multicultural",
    "진단과 치료의 문화적 적합성",
    ["문화적 표현 차이", "진단 편향", "언어 접근성", "낙인과 편견", "치료 적합성"]),
  ebp:        hub("cl", "clinical", "근거기반실천",  "evidence_based_practice",
    "연구 근거와 임상 판단의 통합 — 연구·임상 사이의 연결 노드 (§2-2)",
    ["무작위 대조연구", "메타분석", "치료효과성", "측정기반 진료", "가이드라인"])
};

// ---------------- Shared bridge hubs (§3-1) with cross-domain contrast text ----------------
// description format: "상담: [...] ↔ 임상: [...]" — the sole surface where §3-1's
// contrast table reaches the learner. Powers C5 (cross-domain identity).
const shared: Array<{ k: string; ko: string; desc: string }> = [
  { k: "target",       ko: "대상",
    desc: "상담: 학생, 내담자, 발달적 특성 ↔ 임상: 환자, 내담자, 생애주기 특성" },
  { k: "problem",      ko: "문제/증상",
    desc: "상담: 학업·정서·관계 문제 ↔ 임상: 정신병리·증상·위험" },
  { k: "mechanism",    ko: "원인/기제",
    desc: "상담: 동기, 환경, 인지, 관계 ↔ 임상: 병인론, 유지요인, 생물학적 기초" },
  { k: "evaluation",   ko: "평가",
    desc: "상담: 면담, 학교 적응 평가, 진로검사 ↔ 임상: 진단면담, 심리검사, 신경심리검사" },
  { k: "intervention", ko: "개입",
    desc: "상담: 상담이론, 상담기술, 프로그램 ↔ 임상: 치료접근, 위기개입, 약물 협력" },
  { k: "process",      ko: "과정",
    desc: "상담: 상담과정, 학교 협력 과정 ↔ 임상: 치료과정, 사례개념화, 모니터링" },
  { k: "context",      ko: "맥락",
    desc: "상담: 학교, 가족, 또래, 교육제도 ↔ 임상: 가족, 병원, 지역사회, 문화" },
  { k: "ethics",       ko: "윤리·전문성",
    desc: "상담: 비밀보장, 수퍼비전 ↔ 임상: 동의, 법적 이슈, 협진" },
  { k: "outcome",      ko: "성과",
    desc: "상담: 적응, 자기이해, 진로발달 ↔ 임상: 증상감소, 기능회복, 재발예방" }
];
for (const s of shared) {
  const id = `s_${s.k}`;
  nodes.push({ id, domain: "shared", level: "top_hub", labelKo: s.ko, description: s.desc });
}

// bridges_to edges — each shared hub links to its counterpart in both domains.
// confidence deliberately left undefined on seed; populated by Delphi rounds.
const bridgeMap: Array<[string, string[], string[]]> = [
  ["s_target",       ["c_educational_context"],                          ["cl_lifespan_clinical"]],
  ["s_problem",      ["c_problem_areas"],                                ["cl_psychopathology", "cl_symptoms_signs"]],
  ["s_mechanism",    ["c_individual_differences", "c_human_development"],["cl_etiology", "cl_neuro_biological"]],
  ["s_evaluation",   ["c_counseling_assessment"],                        ["cl_clinical_assessment"]],
  ["s_intervention", ["c_counseling_theories", "c_counseling_skills", "c_prevention_programs"], ["cl_treatment_approaches"]],
  ["s_process",      ["c_counseling_process"],                           ["cl_treatment_process", "cl_case_conceptualization"]],
  ["s_context",      ["c_educational_context", "c_multicultural_diversity"], ["cl_clinical_multicultural"]],
  ["s_ethics",       ["c_ethics_professionalism"],                       ["cl_clinical_ethics_legal"]],
  ["s_outcome",      ["c_outcomes_change"],                              ["cl_evidence_based_practice"]]
];
for (const [hubId, cHubs, lHubs] of bridgeMap) {
  for (const hid of [...cHubs, ...lHubs]) {
    edges.push({ id: `e_${hubId}__${hid}`, sourceId: hubId, targetId: hid, relation: "bridges_to" });
  }
}

// ---------------- Seed paths (§1-4 counseling, §2-4 clinical) ----------------
// Every step is a real node id — resolved via concept() or a bare hub id.
// These are the eight expert-reference starting paths from the plan document.
const paths: Path[] = [
  { id: "p_c1", kind: "seeded_template",
    title: "학업문제 → 자기효능감 → CBT → 상담기술 → 성과",
    nodeSequence: [
      concept(C.problem, "학업문제"),
      concept(C.indiv,   "자기효능감"),
      concept(C.theory,  "인지행동치료(CBT)"),
      C.skills,
      C.outcome
    ] },
  { id: "p_c2", kind: "seeded_template",
    title: "진로문제 → 진로정체성 → 진로흥미검사 → 진로교육 프로그램 → 의사결정 능력 향상",
    nodeSequence: [
      concept(C.problem, "진로문제"),
      concept(C.career,  "진로정체성"),
      concept(C.assess,  "진로흥미검사"),
      concept(C.prevent, "진로교육 프로그램"),
      concept(C.outcome, "의사결정 능력 향상")
    ] },
  { id: "p_c3", kind: "seeded_template",
    title: "정서문제 → 평가 및 사정 → 상담과정 → 개입 → 학교적응 향상",
    nodeSequence: [
      concept(C.problem, "정서문제"),
      C.assess,
      C.process,
      concept(C.process, "개입"),
      concept(C.outcome, "학교적응 향상")
    ] },
  { id: "p_c4", kind: "seeded_template",
    title: "대인관계문제 → 애착 기반 관점 → 공감 → 집단상담 → 성과",
    nodeSequence: [
      concept(C.problem, "대인관계문제"),
      concept(C.theory,  "애착 기반 관점"),
      concept(C.skills,  "공감"),
      concept(C.prevent, "집단상담"),
      C.outcome
    ] },
  { id: "p_l1", kind: "seeded_template",
    title: "우울장애 → 우울기분 → 인지왜곡 → 임상면담 → CBT → 재발예방",
    nodeSequence: [
      concept(L.psychopath, "우울장애"),
      concept(L.symptoms,   "우울기분"),
      concept(L.etiology,   "인지왜곡"),
      concept(L.assess,     "임상면담"),
      concept(L.treatment,  "인지행동치료(CBT)"),
      concept(L.process,    "재발예방")
    ] },
  { id: "p_l2", kind: "seeded_template",
    title: "불안장애 → 공황발작 → 사례개념화 → CBT → 중재 수행 → 변화 모니터링",
    nodeSequence: [
      concept(L.psychopath, "불안장애"),
      concept(L.symptoms,   "공황발작"),
      L.concept,
      concept(L.treatment,  "인지행동치료(CBT)"),
      concept(L.process,    "중재 수행"),
      concept(L.process,    "변화 모니터링")
    ] },
  { id: "p_l3", kind: "seeded_template",
    title: "성격장애 → 충동성 → 위험 및 위기관리 → DBT → 치료과정",
    nodeSequence: [
      concept(L.psychopath, "성격장애"),
      concept(L.symptoms,   "충동성"),
      L.risk,
      concept(L.treatment,  "변증법적 행동치료(DBT)"),
      L.process
    ] },
  { id: "p_l4", kind: "seeded_template",
    title: "신경발달장애 → 아동청소년 임상 → 평가 및 진단 → 협진과 의뢰 → 치료계획 수립",
    nodeSequence: [
      concept(L.psychopath, "신경발달장애"),
      concept(L.lifespan,   "아동청소년 임상"),
      L.assess,
      concept(L.ethics,     "협진과 의뢰"),
      concept(L.process,    "치료계획 수립")
    ] }
];

const outPath = resolve(process.cwd(), "src/client/data/core-graph.seed.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ nodes, edges, paths }, null, 2));
console.log(`[seed] wrote ${nodes.length} nodes, ${edges.length} edges, ${paths.length} paths → ${outPath}`);
