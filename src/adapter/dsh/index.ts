import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { GoalChanged } from '@deepseek-ai/dsh-goal';
import type { Session } from '@deepseek-ai/dsh-session';
import { ConfigSchema, type Config } from '../../config.js';
import { InMemoryTaskLifecycle } from '../task-lifecycle/in-memory-task-lifecycle.js';
import { goalChangedToEvent, sessionDisposedToEvent } from './lifecycle-mapping.js';
import { readDshVersion } from './package-info.js';
import { checkDshVersion } from './version-gate.js';

/**
 * DSH adapter plugin entrypoint (ADR-002/003).
 *
 * This milestone registers lifecycle listeners and a readiness signal only —
 * no scanning, quarantine, restore, or permanent-delete path is wired. The
 * normalized events are published into an in-memory bus that the cleanup
 * orchestrator will subscribe to once the real implementation lands.
 */
const apply = (ctx: Context, config: Config): void => {
  const version = readDshVersion();
  checkDshVersion(version);

  const lifecycle = new InMemoryTaskLifecycle();
  let seq = 0;

  ctx.on('goal/changed', (payload: { agent: Agent; change: GoalChanged }): void => {
    if (!config.lifecycle.goalPrimary) return;
    const event = goalChangedToEvent({
      agent: payload.agent,
      change: payload.change,
      seq: seq++,
      timestamp: Date.now(),
    });
    if (event) lifecycle.publish(event);
  });

  ctx.on('session/disposed', (session: Session): void => {
    if (!config.lifecycle.sessionFallback) return;
    lifecycle.publish(
      sessionDisposedToEvent({ session, seq: seq++, timestamp: Date.now() }),
    );
  });

  // Readiness probe: listeners are registered and the version gate passed.
  ctx.logger('dsh-task-cleaner').info(
    'dsh-task-cleaner ready (dryRun=%s, dsh=%s)',
    config.dryRun,
    version,
  );
};

export const plugin = Object.defineProperty(apply, 'name', {
  value: 'dsh-task-cleaner',
  configurable: true,
}) as typeof apply & { Config: typeof ConfigSchema };
plugin.Config = ConfigSchema;

export default plugin;
export { apply };
