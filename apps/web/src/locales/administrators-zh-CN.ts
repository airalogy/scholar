export default {
  administrators: {
    title: '管理员授权与交接',
    identityRule: '每人保留自己的账号和工号。人员更替应移交权限，不要把离职者的工号直接改成接任者的工号。',
    ownerWarning: '当前有效所有者：{count} 人。建议保留至少两位身份已核验的所有者，降低无人可管理的风险。',
    departing: '离职管理员', successor: '接任者', choose: '选择账号', preview: '预览交接清单',
    checklist: '移交 {labs} 个课题组的所有权；撤销 {grants} 项审核授权、停用 {invitations} 个邀请和 {credentials} 个接口凭据。尚有 {tasks} 项审核任务需要核对。',
    taskWarning: '审核资格不会自动复制。请在审核治理中单独授权合格人员并调整待办；历史操作记录和人员身份保持不变。',
    reason: '变更原因／工单编号（3–1000 字）',
    acknowledge: '已核验接任者和待办事项。确认后立即暂停离职人员，其现有登录会话也将失去访问权限。',
    confirm: '确认交接并停用离职人员',
    completed: '交接已完成。请另行核对待办任务并配置替代接口凭据。',
    audit: '权限变更审计', refresh: '刷新记录', before: '变更前', after: '变更后', empty: '暂无权限变更记录。',
    previous: '上一页', next: '下一页', failed: '操作失败，请刷新当前状态后重试。',
    recovery: '所有管理员都无法登录时，由有权限的服务器维护人员运行 scholarctl recover-admin，建立四小时有效的独立恢复账号。本页面不提供免登录恢复入口。',
    reasonRequired: '修改权限前请填写至少三个字的变更原因。',
    roleRestriction: '只有机构所有者或平台管理员可以任命、修改管理员及所有者。',
  },
}
