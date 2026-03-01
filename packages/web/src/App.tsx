import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout/Layout.js';
import { Dashboard } from './pages/Dashboard.js';
import { Servers } from './pages/Servers.js';
import { ServerDetail } from './pages/ServerDetail.js';
import { Snapshots } from './pages/Snapshots.js';
import { Schedules } from './pages/Schedules.js';
import { Settings } from './pages/Settings.js';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/servers" element={<Servers />} />
        <Route path="/servers/:id" element={<ServerDetail />} />
        <Route path="/snapshots" element={<Snapshots />} />
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
