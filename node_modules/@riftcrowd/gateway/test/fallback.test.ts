/**
 * Phase 16 — Fallback Orchestrator unit tests.
 *
 * Tests: FallbackOrchestrator (activate, deactivate, triggers, graceful degradation).
 * FIX 2: Added concurrent disconnect test.
 * FIX 11: Added redundant deactivation guard test.
 * Total target: ≥14 tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FallbackOrchestrator, type FallbackEvent } from '../src/fallback/fallback_orchestrator.js';
import { COMMAND_SCHEMA_VERSION } from '@riftcrowd/shared';

// ===================================================================
// FallbackOrchestrator
// ===================================================================

describe('FallbackOrchestrator', () => {
  let orchestrator: FallbackOrchestrator;

  beforeEach(() => {
    orchestrator = new FallbackOrchestrator();
  });

  it('starts inactive', () => {
    expect(orchestrator.active).toBe(false);
    expect(orchestrator.reason).toBeNull();
  });

  it('getStatus returns inactive initially', () => {
    const status = orchestrator.getStatus();
    expect(status.active).toBe(false);
    expect(status.reason).toBeNull();
    expect(status.activatedAt).toBeNull();
  });

  it('activate sets active and reason', () => {
    const cmd = orchestrator.activate('gateway_disconnected');
    expect(orchestrator.active).toBe(true);
    expect(orchestrator.reason).toBe('gateway_disconnected');
    expect(cmd.type).toBe('ACTIVATE_FALLBACK');
    expect(cmd.schemaVersion).toBe(COMMAND_SCHEMA_VERSION);
    expect(cmd.metadata?.['reason']).toBe('gateway_disconnected');
  });

  it('deactivate clears active and reason', () => {
    orchestrator.activate('provider_disconnected');
    const cmd = orchestrator.deactivate();
    expect(cmd).not.toBeNull();
    expect(orchestrator.active).toBe(false);
    expect(orchestrator.reason).toBeNull();
    expect(cmd!.type).toBe('DEACTIVATE_FALLBACK');
  });

  it('onGatewayDisconnected activates fallback', () => {
    const cmd = orchestrator.onGatewayDisconnected();
    expect(orchestrator.active).toBe(true);
    expect(orchestrator.reason).toBe('gateway_disconnected');
    expect(cmd.type).toBe('ACTIVATE_FALLBACK');
  });

  it('onGatewayReconnected deactivates if reason was gateway_disconnected', () => {
    orchestrator.onGatewayDisconnected();
    const cmd = orchestrator.onGatewayReconnected();
    expect(cmd).not.toBeNull();
    expect(orchestrator.active).toBe(false);
  });

  it('onGatewayReconnected returns null if not active', () => {
    const cmd = orchestrator.onGatewayReconnected();
    expect(cmd).toBeNull();
  });

  it('onProviderDisconnected activates fallback', () => {
    const cmd = orchestrator.onProviderDisconnected();
    expect(orchestrator.active).toBe(true);
    expect(orchestrator.reason).toBe('provider_disconnected');
    expect(cmd.type).toBe('ACTIVATE_FALLBACK');
  });

  it('onProviderReconnected deactivates if reason was provider_disconnected', () => {
    orchestrator.onProviderDisconnected();
    const cmd = orchestrator.onProviderReconnected();
    expect(cmd).not.toBeNull();
    expect(orchestrator.active).toBe(false);
  });

  it('onProviderReconnected returns null if active for different reason', () => {
    orchestrator.onGatewayDisconnected();
    const cmd = orchestrator.onProviderReconnected();
    expect(cmd).toBeNull();
    expect(orchestrator.active).toBe(true); // still active
  });

  it('onVFXPoolExhausted degrades gracefully without activating fallback', () => {
    const result = orchestrator.onVFXPoolExhausted();
    expect(result.degraded).toBe(true);
    expect(orchestrator.active).toBe(false);
  });

  it('onAudioMissing returns silent without activating fallback', () => {
    const result = orchestrator.onAudioMissing();
    expect(result.silent).toBe(true);
    expect(orchestrator.active).toBe(false);
  });

  it('drainCommands returns all commands and clears buffer', () => {
    orchestrator.activate('manual');
    orchestrator.deactivate('manual');
    const cmds = orchestrator.drainCommands();
    expect(cmds).toHaveLength(2);
    expect(cmds[0]!.type).toBe('ACTIVATE_FALLBACK');
    expect(cmds[1]!.type).toBe('DEACTIVATE_FALLBACK');
    const cmds2 = orchestrator.drainCommands();
    expect(cmds2).toHaveLength(0);
  });

  it('onEvent listener receives activate events', () => {
    const events: FallbackEvent[] = [];
    orchestrator.onEvent((e) => events.push(e));
    orchestrator.activate('gateway_disconnected');
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('activate');
    expect(events[0]!.reason).toBe('gateway_disconnected');
  });

  it('onEvent listener receives deactivate events', () => {
    const events: FallbackEvent[] = [];
    orchestrator.onEvent((e) => events.push(e));
    orchestrator.activate('manual');
    orchestrator.deactivate('manual');
    expect(events).toHaveLength(2);
    expect(events[1]!.type).toBe('deactivate');
  });

  it('unsubscribe removes listener', () => {
    const events: FallbackEvent[] = [];
    const unsub = orchestrator.onEvent((e) => events.push(e));
    orchestrator.activate('manual');
    unsub();
    orchestrator.deactivate('manual');
    expect(events).toHaveLength(1);
  });

  it('listener errors are swallowed', () => {
    orchestrator.onEvent(() => { throw new Error('listener error'); });
    // Should not throw
    orchestrator.activate('manual');
    expect(orchestrator.active).toBe(true);
  });

  it('activate updates reason when already active', () => {
    orchestrator.activate('gateway_disconnected');
    orchestrator.activate('provider_disconnected');
    expect(orchestrator.reason).toBe('provider_disconnected');
  });

  it('commands have unique ids', () => {
    orchestrator.activate('manual');
    orchestrator.deactivate('manual');
    const cmds = orchestrator.drainCommands();
    expect(cmds[0]!.id).not.toBe(cmds[1]!.id);
  });

  // FIX 2: Concurrent disconnect test
  it('concurrent gateway+provider disconnect → provider reconnect → still active → gateway reconnect → deactivates', () => {
    // Both disconnect
    orchestrator.onGatewayDisconnected();
    orchestrator.onProviderDisconnected();
    expect(orchestrator.active).toBe(true);

    // Provider reconnects — fallback should remain active (gateway still down)
    const providerReconnectCmd = orchestrator.onProviderReconnected();
    expect(providerReconnectCmd).toBeNull(); // no deactivate yet
    expect(orchestrator.active).toBe(true);

    // Gateway reconnects — now all reasons cleared → deactivates
    const gatewayReconnectCmd = orchestrator.onGatewayReconnected();
    expect(gatewayReconnectCmd).not.toBeNull();
    expect(orchestrator.active).toBe(false);
    expect(gatewayReconnectCmd!.type).toBe('DEACTIVATE_FALLBACK');
  });

  // FIX 2: deactivateReason with single reason
  it('deactivateReason removes only the specified reason', () => {
    orchestrator.activate('gateway_disconnected');
    orchestrator.activate('provider_disconnected');

    const cmd = orchestrator.deactivateReason('gateway_disconnected');
    expect(cmd).toBeNull(); // still active due to provider
    expect(orchestrator.active).toBe(true);
    expect(orchestrator.reason).toBe('provider_disconnected');

    const cmd2 = orchestrator.deactivateReason('provider_disconnected');
    expect(cmd2).not.toBeNull();
    expect(orchestrator.active).toBe(false);
  });

  // FIX 11: Redundant deactivation guard
  it('deactivate returns null when already inactive (redundant deactivation)', () => {
    const cmd = orchestrator.deactivate();
    expect(cmd).toBeNull();
  });

  it('deactivate returns null on double deactivation', () => {
    orchestrator.activate('manual');
    const cmd1 = orchestrator.deactivate();
    expect(cmd1).not.toBeNull();
    const cmd2 = orchestrator.deactivate();
    expect(cmd2).toBeNull();
  });
});
