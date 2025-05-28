import pusher from './pusher';

/**
 * Triggers a Pusher event on a private workspace channel.
 * Ensures consistent channel naming and payload structure.
 *
 * @param workspaceId The ID of the workspace.
 * @param eventName The name of the event (e.g., 'new_message', 'message_status_update', 'ai_status_updated').
 * @param payload The actual data payload to send.
 */
export async function triggerWorkspacePusherEvent(
  workspaceId: string,
  eventName: string,
  payload: any
) {
  const channelName = `private-workspace-${workspaceId}`;
  const eventData = { type: eventName, payload: payload }; // Consistent structure for frontend

  try {
    await pusher.trigger(channelName, eventName, eventData);
    console.log(`[PusherEventHelper] Event '${eventName}' triggered on channel '${channelName}' with payload:`, payload);
  } catch (error) {
    console.error(`[PusherEventHelper] Failed to trigger event '${eventName}' on channel '${channelName}':`, error);
  }
}
