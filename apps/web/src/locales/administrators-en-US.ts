export default {
  administrators: {
    title: 'Administrator lifecycle',
    identityRule: 'People keep their own accounts and employee IDs. Transfer authority; never replace a departed person’s identifier with their successor’s.',
    ownerWarning: 'Active owners: {count}. Maintain at least two independently verified owners to reduce lockout risk.',
    departing: 'Departing administrator', successor: 'Successor', choose: 'Choose an account', preview: 'Preview handoff',
    checklist: 'Transfer {labs} lab ownerships; revoke {grants} reviewer grants, disable {invitations} invitations and revoke {credentials} API credentials. Outstanding review tasks: {tasks}.',
    taskWarning: 'Reviewer qualifications are not copied. Check outstanding tasks and explicitly grant / reassign eligible reviewers in Review Governance. Completed records and identities remain unchanged.',
    reason: 'Change reason / ticket reference (3–1000 characters)',
    acknowledge: 'I verified the successor and outstanding work. The departing person will be suspended immediately and their current sessions will lose access.',
    confirm: 'Confirm handoff and suspend departing person',
    completed: 'Handoff completed. Verify outstanding tasks and replacement credentials separately.',
    audit: 'Permission change audit', refresh: 'Refresh audit', before: 'Before', after: 'After', empty: 'No permission changes recorded.',
    previous: 'Previous', next: 'Next', failed: 'Operation failed. Refresh the current state before retrying.',
    recovery: 'Locked out? An authorized server operator can use scholarctl recover-admin to create a separate recovery account valid for four hours. This page does not provide an anonymous recovery bypass.',
    reasonRequired: 'Enter a change reason of at least three characters before changing permissions.',
    roleRestriction: 'Only owners and platform administrators can appoint or change administrators and owners.',
  },
}
