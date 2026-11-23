// A lost conditional update must abort the transaction, not commit an unlinked event.
class ApprovalConflict extends Error {}

/**
 * Commits the event and the source approval together. Non-reviewable requests never publish.
 * `prepareApproval` maps the current submission to `{ eventFields, approvalFields }`,
 * or returns null to refuse approval. It must not have side effects: MongoDB may rerun it.
 * The caller may announce or report success only after this returns `published`.
 */
export async function publishApprovedEvent({ Events, submissions, id, reviewableStatuses, prepareApproval }) {
  const session = await Events.startSession();
  try {
    return await session.withTransaction(async () => {
      const submission = await submissions.findById(id, null, { session, lean: true });
      if (!submission) return { kind: "missing" };
      if (!reviewableStatuses.includes(submission.status)) return { kind: "reviewed" };

      const approval = prepareApproval(submission);
      if (!approval) return { kind: "refused" };

      const [event] = await Events.create([approval.eventFields], { session });
      const approved = await submissions.findOneAndUpdate(
        { _id: id, status: submission.status },
        { $set: { ...approval.approvalFields, status: "approved", publishedEventId: event._id } },
        { session, returnDocument: "after", runValidators: true },
      );
      if (!approved) throw new ApprovalConflict();
      return { kind: "published", submission: approved, event };
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } catch (error) {
    if (error instanceof ApprovalConflict) return { kind: "reviewed" };
    throw error;
  } finally {
    await session.endSession();
  }
}
