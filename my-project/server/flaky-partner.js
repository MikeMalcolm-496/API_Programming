const express = require('express');
const app = express();

let mode = 'ok'; // ok | slow | flaky | error
let calls = 0;

const tasks = [
  { id: 1, title: 'Write README', dueDate: '2026-11-02', status: 'active' },
  { id: 2, title: 'Ship v1', dueDate: '2026-11-09', status: 'active' },
];

// Switch behaviour without restarting: curl http://localhost:4000/__mode/slow
app.get('/__mode/:m', (req, res) => {
  mode = req.params.m;
  calls = 0;
  res.json({ mode });
});

app.get('/tasks', async (req, res) => {
  calls += 1;
  console.log(`GET /tasks (call ${calls}, mode ${mode})`);

  if (mode === 'slow') { // answers after 10 seconds
    await new Promise(r => setTimeout(r, 10000));
  }

  if (mode === 'flaky' && calls % 3 !== 0) { // fails twice, then works
    return res.status(503).json({ message: 'Try again' });
  }

  if (mode === 'error') { // always fails
    return res.status(500).json({ message: 'Internal error' });
  }

  res.json(tasks);
});

app.listen(4000, () => console.log('Stand-in partner on http://localhost:4000'));