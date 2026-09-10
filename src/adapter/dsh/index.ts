import type { Context, Plugin } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { GoalChanged } from '@deepseek-ai/dsh-goal';
import type { Session } from '@deepseek-ai/dsh-session';
import { ConfigSchema, type Config } from '../../config.js';
import { validateConfigRoots } from '../../config-validation.js';
import { createCleanupRuntime } from '../../app/create-runtime.js';
import type { TaskLifecyclePort } from '../../ports/task-lifecycle.js';
import { InMemoryTaskLifecycle } from '../task-lifecycle/in-memory-task-lifecycle.js';
import { goalChangedToEvent, sessionDisposedToEvent } from './lifecycle-mapping.js';
import { readDshVersion } from './package-info.js';
import { checkDshVersion } from './version-gate.js';

const PLUGIN_NAME = 'dsh-task-cleaner';

/**
 * DSH adapter plugin entrypoint (ADR-002/003).
 *
 * This milestone registers lifecycle listeners and a readiness signal only —
 * no scanning, quarantine, restore, or permanent-delete path is wired. The
 * normalized events are published into the injected lifecycle bus.
 *
 * Host event payloads are untrusted (M2): every handler guards + normalizes
 * and logs-and-skips invalid input instead of throwing into the host. Session
 * disposal is only mapped to `aborted` for sessions with no observed goal
 * activity (M1). Startup performs semantic root validation and refuses to
 * activate on failure (MAJOR-03).
 */
export function createLifecycleAdapter(
  lifecycle: TaskLifecyclePort = new InMemoryTaskLifecycle(),
): Plugin.Function {
  const goalActiveSessions = new Set<string>();
  let seq = 0;

  const apply = (ctx: Context, config: Config): void => {
    const version = readDshVersion();
    checkDshVersion(version);
    validateConfigRoots(config);

    // Composition root: real FsPort/GitPort protections are bound here and
    // consulted by every SafetyKernel decision this runtime produces.
    const runtime = createCleanupRuntime(config);
    runtime.orchestrator.markReady();

    ctx.on('goal/changed', (payload: unknown): void => {
      try {
        if (!config.lifecycle.goalPrimary) return;
        const { agent, change } = (payload ?? {}) as { agent?: Agent; change?: GoalChanged };
        const event = goalChangedToEvent({
          agent: agent as Agent,
          change: change as GoalChanged,
          seq: seq++,
          timestamp: Date.now(),
        });
        if (!event) {
          // `edit` is a legitimate no-boundary operation; everything else that
          // fails to normalize is untrusted input worth a warning.
          if (change?.operation !== 'edit') {
            ctx.logger(PLUGIN_NAME).warn('ignoring malformed goal/changed payload');
          }
          return;
        }
        if (event.scope.sessionId) goalActiveSessions.add(event.scope.sessionId);
        lifecycle.publish(event);
      } catch (error) {
        ctx.logger(PLUGIN_NAME).warn('ignoring malformed goal/changed payload: %s', error);
      }
    });

    ctx.on('session/disposed', (session: unknown): void => {
      try {
        if (!config.lifecycle.sessionFallback) return;
        const event = sessionDisposedToEvent({
          session: session as Session,
          seq: seq++,
          timestamp: Date.now(),
        });
        if (!event) {
          ctx.logger(PLUGIN_NAME).warn('ignoring malformed session/disposed payload');
          return;
        }
        // M1: only sessions with no observed goal activity are reported as aborted.
        if (event.scope.sessionId && goalActiveSessions.has(event.scope.sessionId)) return;
        lifecycle.publish(event);
      } catch (error) {
        ctx.logger(PLUGIN_NAME).warn('ignoring malformed session/disposed payload: %s', error);
      }
    });

    // Readiness probe: listeners are registered and the version/root gates passed.
    ctx.logger(PLUGIN_NAME).info(
      'dsh-task-cleaner ready (dryRun=%s, dsh=%s, workspaceRoot=%s)',
      config.dryRun,
      version,
      config.workspaceRoot ?? 'unset',
    );
  };

  Object.defineProperty(apply, 'name', { value: PLUGIN_NAME, configurable: true });
  return Object.assign(apply, { Config: ConfigSchema }) as Plugin.Function;
}

export const plugin: Plugin.Function = createLifecycleAdapter();

export const apply = plugin;

export default plugin;
