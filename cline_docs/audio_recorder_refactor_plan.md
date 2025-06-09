# Audio Recorder Refactoring Plan

## Objective
Refactor the audio recording and sending functionality from `app/workspace/[id]/conversations/components/ConversationInputArea.tsx` into a new, separate component called `AudioRecorderInput.tsx`.

## Current State Analysis (`ConversationInputArea.tsx`)
The following elements are currently responsible for audio recording and sending within `ConversationInputArea.tsx`:

**State and Refs:**
*   `isRecording`
*   `permissionStatus`
*   `mediaRecorderRef`
*   `audioChunksRef`
*   `recordingStartTimeRef`
*   `recordingDuration`
*   `recordingIntervalRef`

**Functions:**
*   `formatDuration`
*   `handleSendAudioFile`
*   `startRecording`
*   `stopRecording`
*   `handleMicClick`

**JSX:**
*   The microphone button (`<Mic />` icon)
*   The recording duration display and pause button (`<PauseCircle />` icon)

## Detailed Plan

### Step 1: Create `AudioRecorderInput.tsx`
1.  **Create File:** Create a new file at `app/workspace/[id]/conversations/components/AudioRecorderInput.tsx`.
2.  **Move Code:**
    *   Move the `formatDuration` function to `AudioRecorderInput.tsx`.
    *   Move the following state variables and their `useState` initializations to `AudioRecorderInput.tsx`:
        *   `isRecording`
        *   `permissionStatus`
        *   `mediaRecorderRef`
        *   `audioChunksRef`
        *   `recordingStartTimeRef`
        *   `recordingDuration`
        *   `recordingIntervalRef`
    *   Move the following functions to `AudioRecorderInput.tsx`:
        *   `handleSendAudioFile`
        *   `startRecording`
        *   `stopRecording`
        *   `handleMicClick`
    *   Move the JSX related to the microphone button and the recording display (including the duration and pause button) into `AudioRecorderInput.tsx`.

### Step 2: Define Props for `AudioRecorderInput.tsx`
The `AudioRecorderInput` component will need the following props to interact with its parent (`ConversationInputArea.tsx`) and perform its functions:

*   `conversationId: string`
*   `sendMediaMessage: (conversationId: string, file: File) => Promise<void>`
*   `commonDisabled: boolean` (to control the disabled state of the mic button based on parent's overall disabled state)
*   `isSendingMessage: boolean` (to control the disabled state of the mic button based on parent's message sending state)
*   `isUploading: boolean` (to control the disabled state of the mic button based on parent's upload state)
*   `isRecording: boolean` (This will be an internal state of AudioRecorderInput, but we might need to expose a callback if ConversationInputArea needs to react to its changes, e.g., `onRecordingChange: (isRecording: boolean) => void`) - *Self-correction: `isRecording` will be managed internally, `ConversationInputArea` will only need to know if it's active for `isTextareaDisabled` logic.*

### Step 3: Update `ConversationInputArea.tsx`
1.  **Remove Moved Code:** Remove all the state, refs, functions, and JSX that were moved to `AudioRecorderInput.tsx`.
2.  **Import New Component:** Add an import statement for `AudioRecorderInput` at the top of the file.
3.  **Render New Component:** Replace the removed audio-related JSX with an instance of the `AudioRecorderInput` component, passing the required props:
    ```tsx
    {messageType === 'reply' && (
        <AudioRecorderInput
            conversationId={conversationId}
            sendMediaMessage={sendMediaMessage}
            commonDisabled={commonDisabled}
            isSendingMessage={isSendingMessage}
            isUploading={isUploading}
        />
    )}
    ```
4.  **Adjust `isTextareaDisabled` Logic:** The `isTextareaDisabled` variable in `ConversationInputArea.tsx` currently depends on `isRecording`. Since `isRecording` will now be internal to `AudioRecorderInput`, `ConversationInputArea` will need a way to know if recording is active to disable the textarea.
    *   **Option A (Preferred):** Pass `isRecording` state from `AudioRecorderInput` back to `ConversationInputArea` via a callback prop (e.g., `onRecordingChange`).
    *   **Option B:** Re-evaluate if `isTextareaDisabled` truly needs to react to `isRecording` from the parent's perspective, or if the `AudioRecorderInput` itself handles disabling its own input when recording. Given the current `isTextareaDisabled` logic, Option A seems necessary.

    Let's refine Option A:
    *   Add `onRecordingChange?: (isRecording: boolean) => void` to `AudioRecorderInputProps`.
    *   In `AudioRecorderInput`, call `onRecordingChange(true)` when recording starts and `onRecordingChange(false)` when it stops.
    *   In `ConversationInputArea`, add a state `[isAudioRecordingActive, setIsAudioRecordingActive] = useState(false);` and pass `setIsAudioRecordingActive` to `onRecordingChange`.
    *   Update `isTextareaDisabled` to include `isAudioRecordingActive`.

## Diagram

```mermaid
graph TD
    A[ConversationInputArea.tsx] --> B{Extract Audio Recording Logic}
    B --> C[New AudioRecorderInput.tsx]
    C --> D[Props for AudioRecorderInput:
        conversationId,
        sendMediaMessage,
        commonDisabled,
        isSendingMessage,
        isUploading,
        onRecordingChange (callback)]
    B --> E[Update ConversationInputArea.tsx]
    E --> F[Import AudioRecorderInput]
    E --> G[Render AudioRecorderInput with props]
    G --> H[ConversationInputArea's isTextareaDisabled
        now uses isAudioRecordingActive state
        updated by AudioRecorderInput's onRecordingChange]