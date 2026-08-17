import { useEffect, useState } from 'react';
import api from '../api/client.js';

// Dropdown of agents (scoped by the backend to the caller's team for managers).
// Reused on Calls / Leads / Follow-ups to filter data by a specific user.
export default function AgentFilter({ value, onChange, allLabel = 'All agents' }) {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    api.get('/users', { params: { role: 'AGENT', pageSize: 200 } })
      .then((r) => setAgents(r.data.data))
      .catch(() => {});
  }, []);

  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}
