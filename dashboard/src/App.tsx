/**
 * Phase 13 — Creator Dashboard App.
 * Sidebar navigation with page routing. No react-router needed for simple state-based routing.
 */
import { useState, type JSX } from 'react';
import { Layout } from './components/Layout.js';
import { StatusCards } from './components/StatusCards.js';
import { ProviderSettings } from './components/ProviderSettings.js';
import { ModeSelection } from './components/ModeSelection.js';
import { GiftMapping } from './components/GiftMapping.js';
import { Cooldown } from './components/Cooldown.js';
import { ContentPacks } from './components/ContentPacks.js';
import { TestEvents } from './components/TestEvents.js';
import { EmergencyActions } from './components/EmergencyActions.js';
import { AuthSettings } from './components/AuthSettings.js';

export function App(): JSX.Element {
  const [page, setPage] = useState('status');

  const renderPage = (): JSX.Element => {
    switch (page) {
      case 'status':
        return <StatusCards />;
      case 'provider':
        return <ProviderSettings />;
      case 'mode':
        return <ModeSelection />;
      case 'gifts':
        return <GiftMapping />;
      case 'cooldowns':
        return <Cooldown />;
      case 'packs':
        return <ContentPacks />;
      case 'test-events':
        return <TestEvents />;
      case 'emergency':
        return <EmergencyActions />;
      case 'auth':
        return <AuthSettings />;
      default:
        return <StatusCards />;
    }
  };

  return (
    <Layout activePage={page} onNavigate={setPage}>
      {renderPage()}
    </Layout>
  );
}
