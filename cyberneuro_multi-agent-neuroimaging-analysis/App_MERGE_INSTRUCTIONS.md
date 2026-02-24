# App.tsx Merge Instructions

Apply these changes IN ORDER to the gh-page `App.tsx`.

---

## 1. Add import (after existing imports, before `const VISUALIZER_AGENT`)

```typescript
import { useWorkflow } from './hooks/useWorkflow';
```

---

## 2. Add workflow hook and helpers (inside App component, after `workflowRunIdRef`)

Find this line:
```typescript
  const workflowRunIdRef = useRef(0);
```

Add AFTER it:
```typescript

  // ── Workflow history (ThinkingOverlay) ──
  const { history, wf } = useWorkflow();
  const workflowStartRef = useRef<number>(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const finalizeWorkflow = (phase: 'done' | 'error') => {
    wf.setPhase(phase);
    const elapsed = Math.floor((Date.now() - workflowStartRef.current) / 1000);
    setTimeout(() => {
      wf.finalize(messagesRef.current.length, elapsed);
    }, 50);
  };
```

---

## 3. Add finalizeWorkflow call in handleAbortWorkflow

Find in `handleAbortWorkflow`:
```typescript
    setIsProcessing(false);
    addMessage(AgentType.SYSTEM, '⛔ Workflow aborted by user...');
```

Add `finalizeWorkflow('error');` BEFORE addMessage:
```typescript
    setIsProcessing(false);
    finalizeWorkflow('error');
    addMessage(AgentType.SYSTEM, '⛔ Workflow aborted by user. Submit a new query to restart from the beginning.');
```

---

## 4. Instrument handleUserQuery — start workflow tracking

### 4a. After the user message is added and processing starts

Find in `handleUserQuery`:
```typescript
    addMessage(AgentType.USER, query);
    setIsProcessing(true);
    const runId = startWorkflowRun();
```

Add after `const runId = startWorkflowRun();`:
```typescript
    workflowStartRef.current = Date.now();
```

### 4b. Start workflow record for suspended state resume

Find:
```typescript
    if (suspendedState) {
       if (!activeDataset) {
```

No change here. Find further down the suspended block:
```typescript
       addMessage(AgentType.SYSTEM, "Received clarification. Resuming execution...");
      setActiveWorkflowMode('DATASET');
```

No workflow record needed here since the original workflow is already tracked.

### 4c. Start workflow record for NEW queries (non-suspended)

Find in the main try block of handleUserQuery:
```typescript
      addMessage(AgentType.ORCHESTRATOR, "Evaluating query intent...");
```

Add BEFORE it:
```typescript
      wf.startNewQuery(query, messagesRef.current.length);
```

### 4d. Set phase after intent classification

Find:
```typescript
      addMessage(
        AgentType.ORCHESTRATOR,
        effectiveIntent === intent
```

This is fine, no change. But find the VISION branch right after:
```typescript
      if (effectiveIntent === 'VISION') {
        setActiveWorkflowMode('IMAGE');
```

Add `wf.setPhase('executing');` after setActiveWorkflowMode:
```typescript
      if (effectiveIntent === 'VISION') {
        setActiveWorkflowMode('IMAGE');
        wf.setPhase('executing');
```

And at the END of the vision block (before the `return;`), add:
```typescript
        finalizeWorkflow('done');
        return;
```
(Replace the existing bare `return;`)

### 4e. Set planning phase

Find:
```typescript
      const workflowIntent: 'RESEARCH' | 'GENERAL' = effectiveIntent === 'RESEARCH' ? 'RESEARCH' : 'GENERAL';
      setActiveWorkflowMode('DATASET');
```

Add after:
```typescript
      wf.setPhase('planning');
```

### 4f. Set validating phase

Find (inside the planning while loop):
```typescript
        if (isPlanValidationEnabled) {
          addMessage(AgentType.PLAN_VALIDATOR, "Verifying analysis steps...");
```

Add before that addMessage:
```typescript
          wf.setPhase('validating');
```

### 4g. Set planning phase on retry

Find:
```typescript
            addMessage(AgentType.PLAN_VALIDATOR, `Plan rejected (Attempt ${planningRetries}/${MAX_PLANNING_RETRIES}):\n${errors.map((e: string) => `- ${e}`).join('\n')}\n\nProviding feedback to Planner for correction...`);
            
            if (planningRetries >= MAX_PLANNING_RETRIES) {
              addMessage(AgentType.SYSTEM, "Critical: Planning failed to stabilize after multiple validation cycles. Stopping execution.");
              setIsProcessing(false);
              return;
```

Change the return block to also finalize:
```typescript
            if (planningRetries >= MAX_PLANNING_RETRIES) {
              addMessage(AgentType.SYSTEM, "Critical: Planning failed to stabilize after multiple validation cycles. Stopping execution.");
              finalizeWorkflow('error');
              setIsProcessing(false);
              return;
```

And after the failed validation block (where it loops back), add:
```typescript
          wf.setPhase('planning');
```

### 4h. Set executing phase before executePlanSteps

Find:
```typescript
      await executePlanSteps(plan, runId, 0, null, [...activeDataset.data], [...activeDataset.columns], workflowIntent, undefined, query);
```

Add before it:
```typescript
      wf.setPhase('executing');
```

### 4i. Finalize on error in catch

Find in the catch block:
```typescript
    } catch (error) {
      if (!isWorkflowAbortedError(error)) {
        console.error(error);
        addMessage(AgentType.SYSTEM, "An error occurred during the workflow.");
      }
```

Change to:
```typescript
    } catch (error) {
      if (!isWorkflowAbortedError(error)) {
        console.error(error);
        addMessage(AgentType.SYSTEM, "An error occurred during the workflow.");
        finalizeWorkflow('error');
      }
```

---

## 5. Instrument executePlanSteps

### 5a. Add execution progress tracking

Find in executePlanSteps, at the start of the for loop:
```typescript
    for (let i = 0; i < stepsToRun.length; i++) {
      throwIfWorkflowAborted(runId);
      const step = stepsToRun[i];
```

Add after `const step = stepsToRun[i];`:
```typescript
      wf.setExecutionProgress(i, totalSteps);
```

Note: `totalSteps` is not currently defined. Add this after `const allTools`:
```typescript
    const totalSteps = stepsToRun.length;
```

### 5b. Final progress tick after all steps

Find near the end of executePlanSteps, after the for loop ends but before the research section:
```typescript
      await new Promise(r => setTimeout(r, 1000));
      throwIfWorkflowAborted(runId);
    }
```

Add after the closing `}` of the for loop:
```typescript
    wf.setExecutionProgress(totalSteps, totalSteps);
```

### 5c. Set researching phase

Find:
```typescript
    if (intent === 'RESEARCH') {
      if (!isResearchReportEnabled) {
```

Add before the if check:
```typescript
    if (intent === 'RESEARCH') {
      wf.setPhase('researching');
      if (!isResearchReportEnabled) {
```

### 5d. Finalize at end of executePlanSteps

Find at the end of executePlanSteps:
```typescript
    } else {
      addMessage(AgentType.SYSTEM, "Task complete.");
    }
```

Add after:
```typescript
    finalizeWorkflow('done');
```

---

## 6. Instrument handleRestartFromStep

### 6a. Set workflowStartRef

Find in handleRestartFromStep:
```typescript
        setIsProcessing(true);
        setActiveWorkflowMode('DATASET');
        const runId = startWorkflowRun();
```

Add after `const runId = startWorkflowRun();`:
```typescript
        workflowStartRef.current = Date.now();
        wf.startNewQuery(`Re-plan: ${newPlan.rationale?.slice(0, 40) || 'Manual edit'}`, messages.length);
```

### 6b. Finalize on validation failure

Find:
```typescript
                addMessage(AgentType.PLAN_VALIDATOR, `⚠️ Validation Error: ${validation.errors.join(', ')}\n\nSuggestion: ${validation.suggestions}`);
                setIsProcessing(false);
                return;
```

Change to:
```typescript
                addMessage(AgentType.PLAN_VALIDATOR, `⚠️ Validation Error: ${validation.errors.join(', ')}\n\nSuggestion: ${validation.suggestions}`);
                finalizeWorkflow('error');
                setIsProcessing(false);
                return;
```

### 6c. Set executing phase before execution

Find:
```typescript
        addMessage(AgentType.PLAN_VALIDATOR, "Plan validated successfully. Resuming execution...");
```

Add after:
```typescript
        wf.setPhase('executing');
```

---

## 7. Pass history to ChatArea

Find in the rightPanel JSX where ChatArea is rendered:
```typescript
        <ChatArea 
          messages={messages} 
          onSendMessage={handleUserQuery} 
```

Add the history prop:
```typescript
        <ChatArea 
          messages={messages} 
          onSendMessage={handleUserQuery} 
          ...existing props...
          history={history}
        />
```

The full prop addition — add `history={history}` at the end of the ChatArea props list, before the closing `/>`.

---

## Summary of all changes

- 1 new import
- ~15 lines of new state/helpers (useWorkflow, workflowStartRef, messagesRef, finalizeWorkflow)
- ~20 single-line insertions of `wf.setPhase(...)`, `wf.setExecutionProgress(...)`, `wf.startNewQuery(...)`, `finalizeWorkflow(...)` 
- 1 new prop passed to ChatArea

Total: ~35 lines added/modified. No existing logic changed.
