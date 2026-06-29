import type { PromptBlock, PromptBlockComparison, PromptBlockMetrics, PromptBuildResult } from "@/lib/prompts/prompt-block-types"; /* 第54天：引入提示词块、组合预览、块差异和块指标类型。 */

export type PromptComponentType = "agent" | "tool" | "reflection" | "evaluation" | "supervisor"; /* 绗?2澶╋細瀹氫箟 Prompt锛堟彁绀鸿瘝锛夋墍灞炵粍浠剁被鍨嬨€?*/

export type PromptStatus = "draft" | "active" | "archived"; /* 绗?2澶╋細瀹氫箟 Prompt锛堟彁绀鸿瘝锛夌敓鍛藉懆鏈熺姸鎬併€?*/

export type PromptTemplate = { /* 绗?2澶╋細瀹氫箟鍙増鏈寲銆佸彲娓叉煋銆佸彲婵€娲诲拰鍙綊妗ｇ殑鎻愮ず璇嶆ā鏉裤€?*/
  id: string; /* 绗?2澶╋細淇濆瓨 Prompt锛堟彁绀鸿瘝锛夌殑鍞竴鏍囪瘑锛屼緥濡?research.v3銆?*/
  name: string; /* 绗?2澶╋細淇濆瓨 Prompt锛堟彁绀鸿瘝锛夌殑浜虹被鍙鍚嶇О銆?*/
  componentType: PromptComponentType; /* 绗?2澶╋細淇濆瓨浣跨敤璇?Prompt锛堟彁绀鸿瘝锛夌殑缁勪欢绫诲瀷銆?*/
  componentId: string; /* 绗?2澶╋細淇濆瓨浣跨敤璇?Prompt锛堟彁绀鸿瘝锛夌殑缁勪欢 ID銆?*/
  version: string; /* 绗?2澶╋細淇濆瓨 Prompt Version锛堟彁绀鸿瘝鐗堟湰锛夛紝渚嬪 v1銆乿2銆乿3銆?*/
  template: string; /* 绗?2澶╋細淇濆瓨甯﹀彉閲忓崰浣嶇鐨?Prompt Template锛堟彁绀鸿瘝妯℃澘锛夋鏂囥€?*/
  variables: string[]; /* 绗?2澶╋細淇濆瓨妯℃澘瑕佹眰娉ㄥ叆鐨勫彉閲忓悕鍒楄〃銆?*/
  status: PromptStatus; /* 绗?2澶╋細淇濆瓨褰撳墠鐗堟湰鏄崏绋裤€佸惎鐢ㄤ腑杩樻槸宸插綊妗ｃ€?*/
  createdAt: number; /* 绗?2澶╋細淇濆瓨鎻愮ず璇嶇増鏈垱寤烘椂闂存埑銆?*/
  updatedAt: number; /* 绗?2澶╋細淇濆瓨鎻愮ず璇嶇増鏈渶杩戞洿鏂版椂闂存埑銆?*/
  source?: string; /* 绗?2澶╋細鍙€変繚瀛樻彁绀鸿瘝鏉ユ簮锛屼究浜庤拷韪粠浠ｇ爜銆佸疄楠屾垨浜哄伐璇勫鑰屾潵銆?*/
  score?: number; /* 绗?2澶╋細鍙€変繚瀛樻渶杩戣瘎浼板垎锛屼究浜庡拰鍥炲綊璇勪及寤虹珛鍏宠仈銆?*/
  costEstimate?: number; /* 绗?2澶╋細鍙€変繚瀛樻渶杩戞垚鏈及绠楋紝渚夸簬 Prompt ROI锛堟彁绀鸿瘝鎶曡祫鍥炴姤锛夊垎鏋愩€?*/
}; /* 绗?2澶╋細缁撴潫 PromptTemplate锛堟彁绀鸿瘝妯℃澘锛夌被鍨嬪畾涔夈€?*/

export type PromptDiffKind = "added" | "removed" | "unchanged"; /* 绗?2澶╋細瀹氫箟鎻愮ず璇嶈绾у樊寮傜被鍨嬨€?*/

export type PromptDiffLine = { /* 绗?2澶╋細瀹氫箟鎻愮ず璇?diff锛堝樊寮傚姣旓級涓殑涓€琛屻€?*/
  kind: PromptDiffKind; /* 绗?2澶╋細淇濆瓨褰撳墠琛屾槸鏂板銆佸垹闄よ繕鏄笉鍙樸€?*/
  text: string; /* 绗?2澶╋細淇濆瓨琛屽唴瀹广€?*/
  lineNumber?: number; /* 绗?2澶╋細淇濆瓨鍘熷琛屽彿锛屾柊澧炶鍙潵鑷€欓€夌増鏈€?*/
}; /* 绗?2澶╋細缁撴潫鎻愮ず璇嶅樊寮傝绫诲瀷銆?*/

export type PromptComparison = { /* 绗?2澶╋細瀹氫箟涓や釜鎻愮ず璇嶇増鏈殑瀵规瘮缁撴灉銆?*/
  componentId: string; /* 绗?2澶╋細淇濆瓨瀵规瘮鎵€灞炵粍浠?ID銆?*/
  baselineVersion: string; /* 绗?2澶╋細淇濆瓨鍩虹嚎鎻愮ず璇嶇増鏈€?*/
  candidateVersion: string; /* 绗?2澶╋細淇濆瓨鍊欓€夋彁绀鸿瘝鐗堟湰銆?*/
  addedLines: string[]; /* 绗?2澶╋細淇濆瓨鍊欓€夌増鏈柊澧炶銆?*/
  removedLines: string[]; /* 绗?2澶╋細淇濆瓨鍊欓€夌増鏈垹闄よ銆?*/
  diff: PromptDiffLine[]; /* 绗?2澶╋細淇濆瓨瀹屾暣琛岀骇 diff銆?*/
}; /* 绗?2澶╋細缁撴潫鎻愮ず璇嶇増鏈姣旂被鍨嬨€?*/

export type PromptVariableContract = { /* 绗?2澶╁寮猴細瀹氫箟缁勪欢鎻愮ず璇嶅厑璁镐娇鐢ㄧ殑鍙橀噺濂戠害銆?*/
  componentId: string; /* 绗?2澶╁寮猴細淇濆瓨濂戠害鎵€灞炵粍浠?ID銆?*/
  componentType: PromptComponentType; /* 绗?2澶╁寮猴細淇濆瓨濂戠害鎵€灞炵粍浠剁被鍨嬨€?*/
  requiredVariables: string[]; /* 绗?2澶╁寮猴細淇濆瓨妯℃澘蹇呴』鍑虹幇鐨勫彉閲忋€?*/
  optionalVariables: string[]; /* 绗?2澶╁寮猴細淇濆瓨妯℃澘鍙互鎸夐渶浣跨敤鐨勫彉閲忋€?*/
  description: string; /* 绗?2澶╁寮猴細淇濆瓨鍙橀噺濂戠害鐨勪汉绫诲彲璇昏鏄庛€?*/
}; /* 绗?2澶╁寮猴細缁撴潫鍙橀噺濂戠害绫诲瀷銆?*/

export type PromptValidationIssueCode = "unknown-variable" | "missing-required-variable" | "undeclared-variable" | "unused-declared-variable" | "duplicate-variable" | "empty-template" | "empty-version"; /* 绗?2澶╁寮猴細瀹氫箟鎻愮ず璇嶆牎楠岄棶棰樹唬鐮併€?*/

export type PromptValidationIssue = { /* 绗?2澶╁寮猴細瀹氫箟鍗曟潯鎻愮ず璇嶆牎楠岄棶棰樸€?*/
  code: PromptValidationIssueCode; /* 绗?2澶╁寮猴細淇濆瓨鏈哄櫒鍙瘑鍒殑闂浠ｇ爜銆?*/
  variable?: string; /* 绗?2澶╁寮猴細淇濆瓨闂鍏宠仈鍙橀噺銆?*/
  message: string; /* 绗?2澶╁寮猴細淇濆瓨鐢ㄦ埛鍙鐨勯棶棰樻弿杩般€?*/
}; /* 绗?2澶╁寮猴細缁撴潫鎻愮ず璇嶆牎楠岄棶棰樼被鍨嬨€?*/

export type PromptValidationResult = { /* 绗?2澶╁寮猴細瀹氫箟鎻愮ず璇嶆ā鏉挎牎楠岀粨鏋溿€?*/
  valid: boolean; /* 绗?2澶╁寮猴細淇濆瓨妯℃澘鏄惁閫氳繃鏍￠獙銆?*/
  componentId: string; /* 绗?2澶╁寮猴細淇濆瓨琚牎楠岀粍浠?ID銆?*/
  allowedVariables: string[]; /* 绗?2澶╁寮猴細淇濆瓨璇ョ粍浠跺厑璁镐娇鐢ㄧ殑鍏ㄩ儴鍙橀噺銆?*/
  requiredVariables: string[]; /* 绗?2澶╁寮猴細淇濆瓨璇ョ粍浠跺繀椤讳娇鐢ㄧ殑鍙橀噺銆?*/
  templateVariables: string[]; /* 绗?2澶╁寮猴細淇濆瓨浠庢ā鏉挎鏂囨彁鍙栧嚭鐨勫彉閲忋€?*/
  declaredVariables: string[]; /* 绗?2澶╁寮猴細淇濆瓨 PromptTemplate.variables 澹版槑鐨勫彉閲忋€?*/
  issues: PromptValidationIssue[]; /* 绗?2澶╁寮猴細淇濆瓨鍏ㄩ儴鏍￠獙闂銆?*/
}; /* 绗?2澶╁寮猴細缁撴潫鎻愮ず璇嶆ā鏉挎牎楠岀粨鏋滅被鍨嬨€?*/

export type PromptMutationInput = { /* 绗?2澶╁寮猴細瀹氫箟鏂板鎴栫紪杈戞彁绀鸿瘝鐨勮緭鍏ョ粨鏋勩€?*/
  id?: string; /* 绗?2澶╁寮猴細淇濆瓨鍙€夋彁绀鸿瘝 ID锛岀己鐪佹椂鐢辩粍浠跺拰鐗堟湰鐢熸垚銆?*/
  name: string; /* 绗?2澶╁寮猴細淇濆瓨鎻愮ず璇嶅悕绉般€?*/
  componentType: PromptComponentType; /* 绗?2澶╁寮猴細淇濆瓨缁勪欢绫诲瀷銆?*/
  componentId: string; /* 绗?2澶╁寮猴細淇濆瓨缁勪欢 ID銆?*/
  version: string; /* 绗?2澶╁寮猴細淇濆瓨鎻愮ず璇嶇増鏈€?*/
  template: string; /* 绗?2澶╁寮猴細淇濆瓨妯℃澘姝ｆ枃銆?*/
  variables: string[]; /* 绗?2澶╁寮猴細淇濆瓨妯℃澘鍙橀噺澹版槑銆?*/
  status: PromptStatus; /* 绗?2澶╁寮猴細淇濆瓨鏈熸湜鐢熷懡鍛ㄦ湡鐘舵€併€?*/
  source?: string; /* 绗?2澶╁寮猴細淇濆瓨鎻愮ず璇嶆潵婧愩€?*/
  score?: number; /* 绗?2澶╁寮猴細淇濆瓨鍙€夎瘎浼板垎銆?*/
  costEstimate?: number; /* 绗?2澶╁寮猴細淇濆瓨鍙€夋垚鏈及绠椼€?*/
}; /* 绗?2澶╁寮猴細缁撴潫鎻愮ず璇嶆柊澧炴垨缂栬緫杈撳叆缁撴瀯銆?*/

export type PromptPreviewResult = { /* 绗?2澶╁寮猴細瀹氫箟鎻愮ず璇嶇紪杈戦瑙堢粨鏋溿€?*/
  draft: PromptTemplate; /* 绗?2澶╁寮猴細淇濆瓨寰呬繚瀛樻垨寰呮瘮杈冪殑鑽夌妯℃澘銆?*/
  validation: PromptValidationResult; /* 绗?2澶╁寮猴細淇濆瓨鑽夌妯℃澘鏍￠獙缁撴灉銆?*/
  comparison: PromptComparison | null; /* 绗?2澶╁寮猴細淇濆瓨鑽夌涓庡綋鍓?active 鐗堟湰鐨勫樊寮傚姣斻€?*/
  renderedPreview: string | null; /* 绗?2澶╁寮猴細淇濆瓨浣跨敤鏍蜂緥鍙橀噺娓叉煋鍚庣殑棰勮鏂囨湰銆?*/
}; /* 绗?2澶╁寮猴細缁撴潫鎻愮ず璇嶇紪杈戦瑙堢粨鏋溿€?*/

export type PromptRegistryMetrics = { /* 绗?2澶╋細瀹氫箟 Prompt Registry锛堟彁绀鸿瘝娉ㄥ唽琛級鎸囨爣銆?*/
  totalPrompts: number; /* 绗?2澶╋細淇濆瓨鎵€鏈夋彁绀鸿瘝鐗堟湰鏁伴噺銆?*/
  activePrompts: number; /* 绗?2澶╋細淇濆瓨 active锛堝惎鐢ㄤ腑锛夌増鏈暟閲忋€?*/
  draftPrompts: number; /* 绗?2澶╋細淇濆瓨 draft锛堣崏绋匡級鐗堟湰鏁伴噺銆?*/
  archivedPrompts: number; /* 绗?2澶╋細淇濆瓨 archived锛堝凡褰掓。锛夌増鏈暟閲忋€?*/
  componentCount: number; /* 绗?2澶╋細淇濆瓨绾冲叆娉ㄥ唽琛ㄧ鐞嗙殑缁勪欢鏁伴噺銆?*/
}; /* 绗?2澶╋細缁撴潫娉ㄥ唽琛ㄦ寚鏍囩被鍨嬨€?*/

export type PromptRegressionLink = { /* 绗?2澶╋細瀹氫箟 Prompt Regression Link锛堟彁绀鸿瘝鍥炲綊鍏宠仈锛夈€?*/
  componentId: string; /* 绗?2澶╋細淇濆瓨鍥炲綊瀵规瘮鎵€灞炵粍浠?ID銆?*/
  baselinePromptId: string; /* 绗?2澶╋細淇濆瓨鍩虹嚎鎻愮ず璇?ID銆?*/
  candidatePromptId: string; /* 绗?2澶╋細淇濆瓨鍊欓€夋彁绀鸿瘝 ID銆?*/
  baselineVersion: string; /* 绗?2澶╋細淇濆瓨鍩虹嚎鎻愮ず璇嶇増鏈€?*/
  candidateVersion: string; /* 绗?2澶╋細淇濆瓨鍊欓€夋彁绀鸿瘝鐗堟湰銆?*/
  result: "passed" | "failed"; /* 绗?2澶╋細淇濆瓨鍊欓€夌増鏈槸鍚﹂€氳繃鍥炲綊銆?*/
  scoreDelta: number; /* 绗?2澶╋細淇濆瓨鍊欓€夌増鏈浉瀵瑰熀绾跨殑璇勫垎鍙樺寲銆?*/
  costDeltaPercent: number; /* 绗?2澶╋細淇濆瓨鍊欓€夌増鏈浉瀵瑰熀绾跨殑鎴愭湰鍙樺寲鐧惧垎姣斻€?*/
}; /* 绗?2澶╋細缁撴潫鎻愮ず璇嶅洖褰掑叧鑱旂被鍨嬨€?*/

export type PromptDashboardSnapshot = { /* 绗?2澶╋細瀹氫箟 Prompt Explorer锛堟彁绀鸿瘝娴忚鍣級鎺ュ彛蹇収銆?*/
  prompts: PromptTemplate[]; /* 绗?2澶╋細淇濆瓨鍏ㄩ儴鎻愮ず璇嶆ā鏉跨増鏈€?*/
  activePrompts: PromptTemplate[]; /* 绗?2澶╋細淇濆瓨姣忎釜缁勪欢褰撳墠 active锛堝惎鐢ㄤ腑锛夌増鏈€?*/
  metrics: PromptRegistryMetrics; /* 绗?2澶╋細淇濆瓨娉ㄥ唽琛ㄨ仛鍚堟寚鏍囥€?*/
  comparison: PromptComparison; /* 绗?2澶╋細淇濆瓨榛樿鐮旂┒鎻愮ず璇?v2 涓?v3 鐨勫樊寮傚姣斻€?*/
  contracts: PromptVariableContract[]; /* 绗?2澶╁寮猴細淇濆瓨鎵€鏈夊唴缃粍浠剁殑鍙橀噺濂戠害銆?*/
  validationResults: Record<string, PromptValidationResult>; /* 绗?2澶╁寮猴細淇濆瓨姣忎釜鎻愮ず璇嶇増鏈殑妯℃澘鏍￠獙缁撴灉銆?*/
  regressionLinks: PromptRegressionLink[]; /* 绗?2澶╋細淇濆瓨鎻愮ず璇嶇増鏈笌鍥炲綊璇勪及涔嬮棿鐨勫叧鑱斻€?*/
  renderedPreview: string; /* 绗?2澶╋細淇濆瓨涓€涓娇鐢ㄧ湡瀹炲彉閲忔覆鏌撳悗鐨勬彁绀鸿瘝棰勮銆?*/
  blocks: PromptBlock[]; /* 绗?4澶╋細淇濆瓨褰撳墠 Prompt Block Registry 涓殑鎻愮ず璇嶅潡鍒楄〃銆?*/
  compositionPreview: PromptBuildResult; /* 绗?4澶╋細淇濆瓨 PromptBuilder 缁勫悎 active prompt 涓庝笂涓嬫枃鍧楀悗鐨勯瑙堢粨鏋溿€?*/
  blockComparison: PromptBlockComparison; /* 绗?4澶╋細淇濆瓨涓や釜 PromptBlock 鐨勫樊寮傚姣旂粨鏋溿€?*/
  blockMetrics: PromptBlockMetrics; /* 绗?4澶╋細淇濆瓨 Length銆乀oken銆丒nabled Rate 鍜?Hit Rate 绛夋彁绀鸿瘝鍧楁寚鏍囥€?*/
  generatedAt: number; /* 绗?2澶╋細淇濆瓨蹇収鐢熸垚鏃堕棿銆?*/
}; /* 绗?2澶╋細缁撴潫 Prompt Explorer 蹇収绫诲瀷銆?*/
