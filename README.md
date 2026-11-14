<!-- @author Pjh -->
# skills

面向代码开发、文档、电脑操作和资料研究的 Agent 技能，包含 `work-eval`、`doc-maintenance` 和 `app-acceptance`，均可独立安装和使用。

## 技能用途

### [work-eval](skills/work-eval/SKILL.md)

用于需要 Agent 实际执行的任务，按用户要求和项目规则完成修改、操作或研究，并核对最终文件、程序行为或来源是否支持交付结论。

工程任务按需接入 [Matt Pocock 技能](skills/work-eval/references/matt-pocock.md)，用于故障诊断、规格与任务安排、实施及代码审查；结果核验按需采用 [pstack 方法](skills/work-eval/references/pstack.md)，驱动实际应用、维护可重复的验证入口、核对性能测量与变更影响。两组方法的结果都回到同一任务的验收，核对原要求、实际工件和证据。

简单任务直接执行与核验；需要跨轮推进时沿用计划、证据和下一动作。技能按当前任务的缺口选择，第三方技能使用实际已安装且可读取的版本。独立复核按明确要求或实际风险安排。

### [app-acceptance](skills/app-acceptance/SKILL.md)

用于前端、后端和联调业务验收，从有效要求和真实入口核对页面、HTTP、持久状态与实际文件，并用已知反例检查验收器。可直接接入项目验证文档、脚本和测试，兼容已有项目验证技能；用户要求建立或完善流程，或缺少可靠入口且需重复验收时，指导形成项目自己的验收流程。随包提供必要集合助手，以及能检出缺表头和持久化丢失的真实E2E样例。

前后端任务使用 work-eval 且本技能已安装时，业务验收分支直接采用它的方法；独立使用时可显式调用。安装和样例入口见[app-acceptance 安装说明](docs/安装与更新.md#安装-app-acceptance)。

### [doc-maintenance](skills/doc-maintenance/SKILL.md)

用于编写说明、修订已有文档、只读审阅和集中整理。它从读者要完成的事情和实际使用条件出发，选择交付格式，核对内容依据、必要信息、标题与正文关系、段落用途及导航；集中整理时，再沿跨页阅读路径检查重复、遗漏和信息归属。

获准修改时，交付修订后的文档并核对最终内容、相关引用和适用的格式要求；只读审阅时，返回问题位置、上下文依据和对读者的影响。技能自带文档规则和处理方法，按适用范围补充项目明确提供的额外文档约束。

文档任务中同时使用两者时，`work-eval` 统筹任务分流、执行协调、验收、复核与恢复，`doc-maintenance` 负责文档内容、组织、表达、格式与阅读路径的专业处理。

## 开始使用

使用支持 Agent Skills 的客户端，按需安装对应技能。安装器需要 Node.js 22.20+；默认安装到当前项目，在命令末尾加 `-g` 可安装到用户级目录。

安装 `work-eval`：

```sh
npx skills add Pjhhhhh/skills --skill work-eval
```

安装 `doc-maintenance`：

```sh
npx skills add Pjhhhhh/skills --skill doc-maintenance
```

安装后，按[调用技能](docs/安装与更新.md#调用技能)选择技能并提交任务。其他安装方式、更新与生效确认见[安装与更新](docs/安装与更新.md)。

## 按问题查阅

| 要做什么 | 阅读入口 |
| --- | --- |
| 安装、更新、确认生效或退出 | [安装与更新](docs/安装与更新.md) |
| 选择工程方法、验证实际结果或恢复任务 | [工作流程](docs/工作流程.md) |
| 验收前端、后端或联调变更 | [应用验收](skills/app-acceptance/SKILL.md) |
| 查 Matt Pocock 工程技能的选择条件 | [Matt Pocock 接入规则](skills/work-eval/references/matt-pocock.md) |
| 查应用验证、性能测量和变更影响的方法 | [pstack 验证与改进方法](skills/work-eval/references/pstack.md) |
| 查方法依据、适用条件与验证结果 | [文档导航](docs/README.md) |

## 许可

项目自有内容采用[MIT许可](LICENSE)。
