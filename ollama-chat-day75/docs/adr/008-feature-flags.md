# ADR-008：使用确定性 Feature Flag 灰度

## Problem
新能力直接全量发布会扩大故障半径，随机灰度又会导致同一用户体验抖动。
## Decision
支持 Disabled、Enabled、Gradual 三种模式，使用主体 ID 稳定哈希决定灰度桶。
## Alternatives
环境变量开关、随机采样、单独部署 Canary 服务。
## Trade-off
获得低成本可回滚灰度，但本地 Flag Store 不等同于企业级配置中心。
## Consequence
每次决策记录模式、桶和原因；多实例生产部署应接入共享配置与变更审计。
