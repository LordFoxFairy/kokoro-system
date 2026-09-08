# System 安全边界

- 所有业务 route 先验证独立 service token：web-bff、kokoro-agent、system-admin；缺任一配置启动失败。Bearer 或受信 internal-secret 使用恒定时间比较。服务端全局写仅 system-admin；tenant header不改变global scope。
- IAM tenant/actor/permission 只在认证服务通道后接纳，不从 body自报。Agent仅 catalog/resolve；BFF resolve403。catalog/resolve为service read；非public Manifest仍要求system:read，BFF不得伪造权限。
- Strict Zod 拒绝unknown fields、非法scope/UUID/时间/分页/CAS。x-request-id安全opaque 1..128，非法400，缺省UUID，每个响应/probe/error均回header；不回旧meta。
- tenant复合谓词、父锁重验、反向引用保护、scope隔离receipt；snapshot SQL guard拒绝immutable修改/删除。Model route不回凭据/endpoint、不执行推理；只支持litellm。
- 查询参数化；SQL只在owner Repository或技术database事务/receipt支持。namespace/fence隔离缓存；poison、Redis故障、存储解码错误fail closed。
- structured logs不含token/body/query/secret_handle；Provider过期tombstone可清credentialhandle，保留自然key永久身份。
- Probe无认证但只返回有限状态；生产网络仅允许可信服务访问。TLS/mTLS、动态workload identity、轮换、IAM权限签发/审计、rate-limit和生产secret管理是外部前置，不声称已接通。
- CI锁action完整SHA，镜像Node24digest、非root/HEALTHCHECK；源码/依赖/secret/镜像扫描、SBOM/provenance配置与实际执行证据区分，见ACCEPTANCE。
