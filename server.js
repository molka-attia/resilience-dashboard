const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { exec } = require('child_process');
const { watchPods } = require('./podWatcher');
const { getEvents } = require('./podWatcher');
const { getMetrics } = require('./prometheus');
const { execSync } = require('child_process');
const axios = require('axios');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // serves HTML
app.use(express.json());
app.use(bodyParser.json());


const PROMETHEUS_URL = 'http://raphtory03:9090';

const PROM_URL = 'http://raphtory03:9090';

const HISTORY_LIMIT = 60; // Keep last 60 data points (5 minutes at 5s interval)

// Middleware
app.use(cors());
app.use(express.static('public'));





// const transporter = nodemailer.createTransport({
//   service: 'gmail', // Or your email service
//   auth: {
//     user: 'pfemolka@gmail.com',
//     pass: 'gixuvwpaecynwqwm'
//   }
// });

// app.post('/api/send-email', async (req, res) => {
//   const { subject, body, to } = req.body;
//   try {
//     await transporter.sendMail({
//       from: 'your-email@gmail.com',
//       to,
//       subject,
//       text: body
//     });
//     res.status(200).send('Email sent');
//   } catch (error) {
//     console.error('Error sending email:', error);
//     res.status(500).send('Failed to send email');
//   }
// })






const transporter = nodemailer.createTransport({
  service: 'gmail', // Or your email service
  auth: {
    user: 'pfemolka@gmail.com',
    pass: 'gixuvwpaecynwqwm'
  }
});

app.post('/api/send-email', async (req, res) => {
  const { subject, body, to } = req.body;
  try {
    await transporter.sendMail({
      from: 'your-email@gmail.com',
      to,
      subject,
      text: body
    });
    res.status(200).send('Email sent');
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).send('Failed to send email');
  }
})




































// --- Input Validation ---
function validateNamespace(namespace) {
  return /^[a-zA-Z0-9-]+$/.test(namespace);
}

function validateDate(dateStr) {
  return !isNaN(Date.parse(dateStr));
}

// --- Success Rate Query ---
function getSuccessRateQuery(namespace) {
  return `(
    sum(rate(istio_requests_total{namespace="${namespace}", response_code=~"2.."}[1m]))
    /
    sum(rate(istio_requests_total{namespace="${namespace}"}[1m]))
  ) * 100`;
}

// // --- Throughput Query ---
// function getThroughputQuery(namespace) {
//   return `sum(rate(istio_requests_total{namespace="${namespace}"}[1m]))`;
// }

function getThroughputQuery(namespace) {
  return `sum(rate(istio_request_bytes_sum{namespace="${namespace}"}[1m]))`;
}



function getRequestThroughputQuery(namespace) {
  return `sum(rate(istio_request_bytes_sum{namespace="${namespace}"}[1m]))`;
}


// --- P99 Latency Query ---
function getP99LatencyQuery(namespace) {
  return `histogram_quantile(0.99, sum(rate(istio_request_duration_milliseconds_bucket{namespace="${namespace}"}[1m])) by (le))`;
}

// --- Average Latency Query ---
function getAverageLatencyQuery(namespace) {
  return `(
    sum(rate(istio_request_duration_milliseconds_sum{namespace="${namespace}"}[1m]))
    /
    sum(rate(istio_request_duration_milliseconds_count{namespace="${namespace}"}[1m]))
  )`;
}


// --- Error rate Query ---
function getErrorRateQuery(namespace) {
  return `(
    sum(rate(istio_requests_total{namespace="${namespace}", response_code!~"2.."}[1m]))
    /
    sum(rate(istio_requests_total{namespace="${namespace}"}[1m]))
  ) * 100`;
}

//------qps----------------------
function getQPSQuery(namespace) {
  return `sum(rate(istio_requests_total{namespace="${namespace}"}[1m]))`;
}


// //--------throughput---------------------------------
// function getThroughputQuery(namespace, durationSeconds) {
//   return `(increase(istio_response_bytes_sum{namespace="${namespace}"}[${durationSeconds}s]) / ${durationSeconds})`;
// }


















// --- Prometheus Query Range Function ---
async function queryPrometheusRange(query, start, end, step = '60s') {
  const res = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
    params: { query, start, end, step },
  });
  return res.data.data.result;
}

// --- Calculate Average from Time-Series Data ---
function calculateAverage(result) {
  if (!result[0]?.values || result[0].values.length === 0) return null;
  const values = result[0].values.map(v => parseFloat(v[1])).filter(v => !isNaN(v));
  if (values.length === 0) return null;
  return (values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(2);
}

// --- Success Rate Endpoint ---
app.get('/api/success-rate', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const query = getSuccessRateQuery(namespace);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const value = calculateAverage(result);

    res.json({
      namespace,
      successRate: value,
      unit: '%',
      timestamp: new Date(),
      message: value === null ? 'No success rate data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching success rate:', err.message);
    res.status(500).send('Error fetching success rate');
  }
});

// --- Throughput Endpoint ---
// app.get('/api/throughput', async (req, res) => {
//   const namespace = req.query.namespace || 'default';
//   const start = req.query.start;
//   const end = req.query.end || new Date().toISOString();

//   if (!validateNamespace(namespace)) {
//     return res.status(400).send('Invalid namespace');
//   }
//   if (!start || !validateDate(start) || !validateDate(end)) {
//     return res.status(400).send('Invalid start or end date');
//   }

//   const query = getThroughputQuery(namespace);

//   try {
//     const result = await queryPrometheusRange(query, start, end);
//     const value = calculateAverage(result);

//     res.json({
//       namespace,
//       throughput: value,
//       unit: 'req/s',
//       timestamp: new Date(),
//       message: value === null ? 'No throughput data in the specified time range' : undefined
//     });
//   } catch (err) {
//     console.error('Error fetching throughput:', err.message);
//     res.status(500).send('Error fetching throughput');
//   }
// });

app.get('/api/throughput', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const query = getThroughputQuery(namespace);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const value = calculateAverage(result);

    res.json({
      namespace,
      throughput: value,
      unit: 'bytes/second',
      timestamp: new Date(),
      message: value === null ? 'No throughput data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching throughput:', err.message);
    res.status(500).send('Error fetching throughput');
  }
});


// --- P99 Latency Endpoint ---
app.get('/api/p99-latency', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const query = getP99LatencyQuery(namespace);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const value = calculateAverage(result);

    res.json({
      namespace,
      p99Latency: value,
      unit: 'ms',
      timestamp: new Date(),
      message: value === null ? 'No latency data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching P99 latency:', err.message);
    res.status(500).send('Error fetching P99 latency');
  }
});



//---Error rate----------------------------------
app.get('/api/error-rate', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const query = getErrorRateQuery(namespace);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const value = calculateAverage(result);

    res.json({
      namespace,
      successRate: value,
      unit: '%',
      timestamp: new Date(),
      message: value === null ? 'No error rate data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching error rate:', err.message);
    res.status(500).send('Error fetching error rate');
  }
});



//--------------qps--------------
app.get('/api/qps', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const query = getQPSQuery(namespace);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const value = calculateAverage(result);

    res.json({
      namespace,
      qps: value,
      unit: 'requests/second',
      timestamp: new Date(),
      message: value === null ? 'No QPS data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching QPS:', err.message);
    res.status(500).send('Error fetching QPS');
  }
});


app.get('/api/throughput2', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const durationSeconds = Math.floor((new Date(end) - new Date(start)) / 1000);
  if (durationSeconds <= 0) {
    return res.status(400).send('End date must be after start date');
  }

  const query = getThroughputQuery(namespace, durationSeconds);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const value = calculateAverage(result);

    res.json({
      namespace,
      throughput: value,
      unit: 'bytes/sec',
      timestamp: new Date(),
      message: value === null ? 'No throughput data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching throughput:', err.message);
    res.status(500).send('Error fetching throughput');
  }
});










// ---  Latency Endpoint ---
app.get('/api/get-latency', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const query = getAverageLatencyQuery(namespace);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const value = calculateAverage(result);

    res.json({
      namespace,
      p99Latency: value,
      unit: 'ms',
      timestamp: new Date(),
      message: value === null ? 'No latency data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching P99 latency:', err.message);
    res.status(500).send('Error fetching P99 latency');
  }
});







function getNetworkUtilizationScoreQuery(namespace) {
  // Assumes max theoretical network throughput = 10MB/s (10,000,000 bytes/sec)
  return `sum(
    rate(container_network_receive_bytes_total{namespace="${namespace}"}[1m]) +
    rate(container_network_transmit_bytes_total{namespace="${namespace}"}[1m])
  ) / 10000000`;
}


app.get('/api/network-utilization-score', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const query = getNetworkUtilizationScoreQuery(namespace);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const value = calculateAverage(result); // normalized score (0 to ~1)

    res.json({
      namespace,
      network_utilization_score: value,
      unit: 'normalized (0-1)',
      timestamp: new Date(),
      message: value === null ? 'No network data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching network utilization score:', err.message);
    res.status(500).send('Error fetching network utilization score');
  }
});



function getNetworkBandwidthQuery(namespace) {
  return `sum(
    rate(container_network_receive_bytes_total{namespace="${namespace}"}[1m]) +
    rate(container_network_transmit_bytes_total{namespace="${namespace}"}[1m])
  ) / 10000000`;
}


app.get('/api/network-bandwidth', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const query = getNetworkBandwidthQuery(namespace);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const value = calculateAverage(result);

    res.json({
      namespace,
      bandwidth: value,
      unit: 'MB/s',
      timestamp: new Date(),
      message: value === null ? 'No bandwidth data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching network bandwidth:', err.message);
    res.status(500).send('Error fetching network bandwidth');
  }
});










































function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        reject(stderr || stdout || err.message);
      } else {
        resolve(stdout);
      }
    });
  });
}










app.post('/inject-network-delay', async (req, res) => {
  const { namespace, service, delayMs = 200, duration = 10, waitBefore = 0 } = req.body;

  if (!namespace) return res.status(400).send('namespace is required');
  if (!service) return res.status(400).send('service is required');

  try {
    // Find pod by label app=service in namespace
    const getPodCmd = `kubectl get pods -n ${namespace} -l app=${service} -o jsonpath="{.items[0].metadata.name}"`;
    const podName = (await execPromise(getPodCmd)).trim();

    if (!podName || podName === '""') {
      return res.status(404).send(`No pod found for service '${service}' in namespace '${namespace}'`);
    }

    // Wait before starting, if specified
    if (waitBefore > 0) {
      console.log(`[INFO] Waiting ${waitBefore}s before injecting network delay`);
      await new Promise(r => setTimeout(r, waitBefore * 1000));
    }

    // tc commands for network delay
    const failureCmd = `tc qdisc show dev eth0 | grep -q 'netem' && tc qdisc change dev eth0 root netem delay ${delayMs}ms || tc qdisc add dev eth0 root netem delay ${delayMs}ms`;
    const cleanupCmd = `tc qdisc del dev eth0 root 2>/dev/null || true`;

    // Inject network delay
    await execPromise(`kubectl exec -n ${namespace} ${podName} -- /bin/sh -c '${failureCmd}'`);
    console.log(`[INFO] Injected ${delayMs}ms network delay on pod ${podName} (service: ${service})`);

    // Wait for duration
    await new Promise(r => setTimeout(r, duration * 1000));

    // Cleanup
    await execPromise(`kubectl exec -n ${namespace} ${podName} -- /bin/sh -c '${cleanupCmd}'`);
    console.log(`[INFO] Cleaned up network delay on pod ${podName}`);

    res.send(`Network delay of ${delayMs}ms injected on pod ${podName} (service: ${service}) for ${duration}s and then cleaned up.`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`Error injecting network delay: ${err.message || err}`);
  }
});






























function getCPUUsageQuery(namespace) {
  return `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}", container!="POD"}[1m]))`;
}


app.get('/api/cpu-usage', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const query = getCPUUsageQuery(namespace);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const value = calculateAverage(result);

    res.json({
      namespace,
      cpu_usage: value,
      unit: 'cores',
      timestamp: new Date(),
      message: value === null ? 'No CPU usage data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching CPU usage:', err.message);
    res.status(500).send('Error fetching CPU usage');
  }
});



















function getMemoryUsageQuery(namespace) {
  return `sum(container_memory_working_set_bytes{namespace="${namespace}", container!="POD"})`;
}
  

app.get('/api/memory-usage', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const start = req.query.start;
  const end = req.query.end || new Date().toISOString();

  if (!validateNamespace(namespace)) {
    return res.status(400).send('Invalid namespace');
  }
  if (!start || !validateDate(start) || !validateDate(end)) {
    return res.status(400).send('Invalid start or end date');
  }

  const query = getMemoryUsageQuery(namespace);

  try {
    const result = await queryPrometheusRange(query, start, end);
    const valueBytes = calculateAverage(result);

    const valueMiB = valueBytes !== null ? valueBytes / (1024 * 1024) : null;

    res.json({
      namespace,
      memory_usage_mib: valueMiB,
      unit: 'MiB',
      timestamp: new Date(),
      message: valueMiB === null ? 'No memory usage data in the specified time range' : undefined
    });
  } catch (err) {
    console.error('Error fetching memory usage:', err.message);
    res.status(500).send('Error fetching memory usage');
  }
});

























// app.post('/inject-istio-delay', async (req, res) => {
//   const {
//     namespace,
//     services = [],
//     istioDelayMs = 200,
//     duration = 10,
//   } = req.body;

//   if (!namespace) return res.status(400).send('namespace is required');
//   if (!Array.isArray(services) || services.length === 0) return res.status(400).send('services array is required');

//   try {
//     // Inject Istio delay fault for each service
//     for (const svc of services) {
//       const yaml = `
// apiVersion: networking.istio.io/v1alpha3
// kind: VirtualService
// metadata:
//   name: ${svc}
// spec:
//   hosts:
//   - ${svc}
//   http:
//   - fault:
//       delay:
//         fixedDelay: ${istioDelayMs}ms
//         percentage:
//           value: 100
//     route:
//     - destination:
//         host: ${svc}
// `;
//       await execPromise(`echo "${yaml}" | kubectl apply -n ${namespace} -f -`);
//       console.log(`[INFO] Applied Istio delay on service ${svc}`);
//     }

//     // Wait for the delay duration
//     await new Promise(resolve => setTimeout(resolve, duration * 1000));

//     // Cleanup VirtualServices to remove the fault
//     for (const svc of services) {
//       await execPromise(`kubectl delete VirtualService ${svc} -n ${namespace}`);
//       console.log(`[INFO] Removed Istio delay VirtualService for service ${svc}`);
//     }

//     res.send(`Istio delay of ${istioDelayMs}ms applied on services ${services.join(', ')} for ${duration}s, then cleaned up.`);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send(`Error injecting Istio delay: ${err.message || err}`);
//   }
// });


app.post('/inject-istio-delay', async (req, res) => {
  const {
    namespace,
    services = [],
    istioDelayMs = 200,
    duration = 10,
    waitBefore = 0, // new param
  } = req.body;

  if (!namespace) return res.status(400).send('namespace is required');
  if (!Array.isArray(services) || services.length === 0) return res.status(400).send('services array is required');

  try {
    // Optional wait before starting the injection
    if (waitBefore > 0) {
      console.log(`[INFO] Waiting ${waitBefore}s before injecting Istio delay...`);
      await new Promise(resolve => setTimeout(resolve, waitBefore * 1000));
    }

    // Inject Istio delay fault for each service
    for (const svc of services) {
      const yaml = `
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: ${svc}
spec:
  hosts:
  - ${svc}
  http:
  - fault:
      delay:
        fixedDelay: ${istioDelayMs}ms
        percentage:
          value: 100
    route:
    - destination:
        host: ${svc}
`;
      await execPromise(`echo "${yaml}" | kubectl apply -n ${namespace} -f -`);
      console.log(`[INFO] Applied Istio delay on service ${svc}`);
    }

    // Wait for the duration of the fault
    await new Promise(resolve => setTimeout(resolve, duration * 1000));

    // Cleanup VirtualServices
    for (const svc of services) {
      await execPromise(`kubectl delete VirtualService ${svc} -n ${namespace}`);
      console.log(`[INFO] Removed Istio delay VirtualService for service ${svc}`);
    }

    res.send(`Istio delay of ${istioDelayMs}ms applied on services ${services.join(', ')} for ${duration}s after waiting ${waitBefore}s, then cleaned up.`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`Error injecting Istio delay: ${err.message || err}`);
  }
});






































app.post('/scale-loadgenerator', async (req, res) => {
  const { namespace, users, duration = 60 } = req.body; // duration in seconds, default 60s

  if (!namespace || typeof users !== 'number' || users < 1) {
    return res.status(400).send('Missing or invalid namespace or users (number >= 1)');
  }

  try {
    // Scale up
    await execPromise(`kubectl -n ${namespace} scale deployment loadgenerator --replicas=${users}`);
    console.log(`[INFO] Load generator scaled to ${users} replicas in namespace ${namespace}`);

    res.send(`Load generator scaled to ${users} replicas in namespace ${namespace}. Will scale down to 1 after ${duration}s.`);

    // After duration seconds, scale back down to 1
    setTimeout(async () => {
      try {
        await execPromise(`kubectl -n ${namespace} scale deployment loadgenerator --replicas=1`);
        console.log(`[INFO] Load generator scaled back down to 1 replica in namespace ${namespace}`);
      } catch (err) {
        console.error(`[ERROR] Failed to scale load generator back down:`, err);
      }
    }, duration * 1000);

  } catch (err) {
    console.error(err);
    res.status(500).send(`Error scaling load generator: ${err.message}`);
  }
});



















































app.post('/inject-network-loss', async (req, res) => {
  const { namespace, service, lossPct = 30, duration = 10, waitBefore = 0 } = req.body;

  if (!namespace) return res.status(400).send('namespace is required');
  if (!service) return res.status(400).send('service is required');

  try {
    // Find pod by label app=service in namespace
    const getPodCmd = `kubectl get pods -n ${namespace} -l app=${service} -o jsonpath="{.items[0].metadata.name}"`;
    const podName = (await execPromise(getPodCmd)).trim();

    if (!podName) {
      return res.status(404).send(`No pod found for service '${service}' in namespace '${namespace}'`);
    }

    // Wait before starting, if specified
    if (waitBefore > 0) {
      console.log(`[INFO] Waiting ${waitBefore}s before injecting network loss`);
      await new Promise(r => setTimeout(r, waitBefore * 1000));
    }

    // tc commands for network loss
    const failureCmd = `tc qdisc show dev eth0 | grep -q 'netem' && tc qdisc change dev eth0 root netem loss ${lossPct}% || tc qdisc add dev eth0 root netem loss ${lossPct}%`;
    const cleanupCmd = `tc qdisc del dev eth0 root 2>/dev/null || true`;

    // Inject network loss
    await execPromise(`kubectl exec -n ${namespace} ${podName} -- /bin/sh -c '${failureCmd}'`);
    console.log(`[INFO] Injected ${lossPct}% network loss on pod ${podName} (service: ${service})`);

    // Wait for duration
    await new Promise(r => setTimeout(r, duration * 1000));

    // Cleanup
    await execPromise(`kubectl exec -n ${namespace} ${podName} -- /bin/sh -c '${cleanupCmd}'`);
    console.log(`[INFO] Cleaned up network loss on pod ${podName}`);

    res.send(`Network loss of ${lossPct}% injected on pod ${podName} (service: ${service}) for ${duration}s and then cleaned up.`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`Error injecting network loss: ${err.message || err}`);
  }
});






// app.post('/inject-network-loss', async (req, res) => {
//   const { podName, lossPct = 30, duration = 10 } = req.body;
//   if (!podName) return res.status(400).send('podName is required');

//   // The tc commands for adding and cleaning network loss
//   const failureCmd = `tc qdisc show dev eth0 | grep -q 'netem' && tc qdisc change dev eth0 root netem loss ${lossPct}% || tc qdisc add dev eth0 root netem loss ${lossPct}%`;
//   const cleanupCmd = `tc qdisc del dev eth0 root 2>/dev/null || true`;

//   try {
//     // Inject network loss
//     await execPromise(`kubectl exec -n molka2 ${podName} -- /bin/sh -c '${failureCmd}'`);
//     console.log(`[INFO] Injected ${lossPct}% network loss on pod ${podName}`);

//     // Wait for duration seconds
//     await new Promise(r => setTimeout(r, duration * 1000));

//     // Cleanup the network loss settings
//     await execPromise(`kubectl exec -n molka2 ${podName} -- /bin/sh -c '${cleanupCmd}'`);
//     console.log(`[INFO] Cleaned up network loss on pod ${podName}`);

//     res.send(`Network loss of ${lossPct}% injected on pod ${podName} for ${duration}s and then cleaned up.`);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send(`Error injecting network loss: ${err}`);
//   }
// });








    // FAILURE_TYPE="NETWORK_LOSS"
    // read -p "[?] Packet loss % (default 30): " LOSS_PCT
    // LOSS_PCT=${LOSS_PCT:-30}

    // FAILURE_CMD="tc qdisc show dev eth0 | grep -q 'netem' && tc qdisc change dev eth0 root netem loss $LOSS_PCT% || tc qdisc add dev eth0 root netem loss $LOSS_PCT%"
    // CLEANUP_CMD="tc qdisc del dev eth0 root 2>/dev/null || true"


































app.post('/inject-memory-fault', async (req, res) => {
  const {
    service,
    namespace = 'default',        // Namespace is now configurable
    memSize = '256M',
    failureDuration = 20,
    waitBefore = 0                // Wait time before injection in seconds
  } = req.body;

  if (!service) {
    return res.status(400).json({ success: false, error: 'Service name is required' });
  }

  try {
    // Optional wait before injection
    if (waitBefore > 0) {
      console.log(`Waiting ${waitBefore}s before injecting memory fault...`);
      await new Promise(resolve => setTimeout(resolve, waitBefore * 1000));
    }

    // Get pod name
    const getPodCmd = `kubectl get pods -n ${namespace} -l app=${service} -o jsonpath="{.items[0].metadata.name}"`;
    const podName = await execPromise(getPodCmd);
    const trimmedPod = podName.trim();

    if (!trimmedPod) {
      return res.status(404).json({ success: false, error: `No pod found for service: ${service}` });
    }

    // Inject memory stress
    const memoryCmd = `kubectl exec -n ${namespace} ${trimmedPod} -- stress-ng --vm 1 --vm-bytes ${memSize} --timeout ${failureDuration}`;
    const output = await execPromise(memoryCmd);

    res.json({
      success: true,
      message: `Memory fault injected in pod ${trimmedPod} (namespace: ${namespace})`,
      output
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || stdout || 'Unknown error'));
      } else {
        resolve(stdout);
      }
    });
  });
}









// const namespace = 'molka2';
// app.post('/inject-memory-fault', async (req, res) => {
//   const { service, memSize = '256M', failureDuration = 20 } = req.body;

//   if (!service) {
//     return res.status(400).json({ success: false, error: 'Service name is required' });
//   }

//   try {
//     // Get the pod name based on app label
//     const getPodCmd = `kubectl get pods -n ${namespace} -l app=${service} -o jsonpath="{.items[0].metadata.name}"`;
//     const podName = await execPromise(getPodCmd);
//     const trimmedPod = podName.trim();

//     if (!trimmedPod) {
//       return res.status(404).json({ success: false, error: `No pod found for service: ${service}` });
//     }

//     const memoryCmd = `kubectl exec -n ${namespace} ${trimmedPod} -- stress-ng --vm 1 --vm-bytes ${memSize} --timeout ${failureDuration}`;
//     const output = await execPromise(memoryCmd);

//     res.json({
//       success: true,
//       message: `Memory fault injected in pod ${trimmedPod}`,
//       output
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || stdout || 'Unknown error'));
      } else {
        resolve(stdout);
      }
    });
  });
}


app.post('/inject-cpu-faulttest', async (req, res) => {
  const { service, namespace, duration, waitBefore } = req.body;

  if (!service || !namespace) {
    return res.status(400).json({ success: false, error: 'Service and namespace are required' });
  }

  try {
    // Get the pod name for the service
    const getPodCmd = `kubectl get pods -n ${namespace} -l app=${service} -o jsonpath="{.items[0].metadata.name}"`;
    const podName = await execPromise(getPodCmd);
    const trimmedPod = podName.trim();

    if (!trimmedPod) {
      return res.status(404).json({ success: false, error: `No pod found for service: ${service}` });
    }

    // Optional delay before injection
    if (waitBefore && waitBefore > 0) {
      await new Promise(resolve => setTimeout(resolve, waitBefore * 1000));
    }

    // Inject CPU stress using stress-ng
    const safeDuration = parseInt(duration, 10) || 10;
    const faultCmd = `kubectl exec -n ${namespace} ${trimmedPod} -- stress-ng --cpu 2 --timeout ${safeDuration}`;
    const output = await execPromise(faultCmd);

    res.json({ success: true, message: `CPU fault injected in pod ${trimmedPod}`, output });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});



// app.post('/inject-cpu-faulttest', async (req, res) => {
//   const { service } = req.body;
//   const namespace = 'molka2';

//   if (!service) {
//     return res.status(400).json({ success: false, error: 'Service name is required' });
//   }

//   try {
//     // Get the pod name matching the service
//     const getPodCmd = `kubectl get pods -n ${namespace} -l app=${service} -o jsonpath="{.items[0].metadata.name}"`;
//     const podName = await execPromise(getPodCmd);
//     const trimmedPod = podName.trim();

//     if (!trimmedPod) {
//       return res.status(404).json({ success: false, error: `No pod found for service: ${service}` });
//     }

//     // Execute stress-ng command in the pod
//     const faultCmd = `kubectl exec -n ${namespace} ${trimmedPod} -- stress-ng --cpu 2 --timeout 10`;
//     const output = await execPromise(faultCmd);

//     res.json({ success: true, message: `Fault injected in pod ${trimmedPod}`, output });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

// function execPromise(cmd) {
//   return new Promise((resolve, reject) => {
//     exec(cmd, (error, stdout, stderr) => {
//       if (error) {
//         reject(new Error(stderr || stdout || 'Unknown error'));
//       } else {
//         resolve(stdout);
//       }
//     });
//   });
// }


// app.post('/inject-cpu-faulttest', (req, res) => {
//   const namespace = 'molka2';
//   const pod = 'checkoutservice-c85fc9d76-nrmqw';
//   const stressCommand = `kubectl exec -n ${namespace} ${pod} -- stress-ng --cpu 2 --timeout 10`;

//   console.log(`[INFO] Executing: ${stressCommand}`);

//   exec(stressCommand, (error, stdout, stderr) => {
//     if (error) {
//       console.error(`[ERROR] ${stderr || error.message}`);
//       return res.status(500).json({ success: false, error: stderr || error.message });
//     }

//     console.log(`[SUCCESS] ${stdout}`);
//     res.json({ success: true, output: stdout });
//   });
// });


















// Helper to run a shell command and return promise
// function execPromise(cmd) {
//   return new Promise((resolve, reject) => {
//     exec(cmd, (err, stdout, stderr) => {
//       if (err) reject(stderr || err.message);
//       else resolve(stdout.trim());
//     });
//   });
// }

// app.post('/inject-cpu-faulttest', async (req, res) => {
//   const namespace = 'molka2';
//   const service = req.body.service;

//   if (!service) {
//     return res.status(400).json({ success: false, error: 'Service name is required' });
//   }

//   try {
//     // Get the first pod name that matches the service (by app label)
//     const getPodCmd = `kubectl get pods -n ${namespace} -l app=${service} -o jsonpath="{.items[0].metadata.name}"`;
//     const podName = await execPromise(getPodCmd);

//     if (!podName) {
//       return res.status(404).json({ success: false, error: `No pod found for service ${service}` });
//     }

//     const stressCmd = `kubectl exec -n ${namespace} ${podName} -- stress-ng --cpu 2 --timeout 10`;
//     console.log(`[INFO] Running: ${stressCmd}`);
//     const output = await execPromise(stressCmd);

//     res.json({ success: true, output });
//   } catch (err) {
//     console.error(`[ERROR] ${err}`);
//     res.status(500).json({ success: false, error: err.toString() });
//   }
// });























// app.post('/inject-fault', async (req, res) => {
//   const {
//     namespace,
//     users,
//     loadDurationMin,
//     failureOption,
//     failureDuration = 300,
//     waitTimeBeforeFailure = 180,
//     cpuWorkers = 2,
//     memSize = '216M',
//     lossPct = 30,
//     delayMs = 200,
//     istioDelayMs = 200,
//     services = [],
//     targetMsList = []
//   } = req.body;

//   const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//   const baseResultsDir = 'results';

//   let failureType = '';
//   let failureCmd = '';
//   let cleanupCmd = '';

//   switch (failureOption) {
//     case 1:
//       failureType = 'CPU';
//       failureCmd = `stress-ng --cpu ${cpuWorkers} --timeout ${failureDuration}`;
//       break;
//     case 2:
//       failureType = 'MEMORY';
//       failureCmd = `stress-ng --vm 1 --vm-bytes ${memSize} --timeout ${failureDuration}`;
//       break;
//     case 3:
//       failureType = 'NETWORK_LOSS';
//       failureCmd = `tc qdisc show dev eth0 | grep -q 'netem' && tc qdisc change dev eth0 root netem loss ${lossPct}% || tc qdisc add dev eth0 root netem loss ${lossPct}%`;
//       cleanupCmd = 'tc qdisc del dev eth0 root 2>/dev/null || true';
//       break;
//     case 4:
//       failureType = 'NETWORK_DELAY';
//       failureCmd = `tc qdisc add dev eth0 root netem delay ${delayMs}ms`;
//       cleanupCmd = 'tc qdisc del dev eth0 root';
//       break;
//     case 5:
//       failureType = 'ISTIO_DELAY';
//       break;
//     default:
//       return res.status(400).send('Invalid failure option');
//   }

//   const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

//   try {
//     // Create result directories
//     targetMsList.forEach(ms => {
//       exec(`mkdir -p ${baseResultsDir}/${ms}/${failureType}/${timestamp}`);

//     });

//     // Launch load generator
// //    await execPromise(`kubectl -n ${namespace} scale deployment loadgenerator --replicas=${users}`);
//     console.log('[INFO] Load generator scaled');

//     // Wait before failure
//     console.log(`[INFO] Waiting ${waitTimeBeforeFailure}s before injecting failure...`);
//     await delay(waitTimeBeforeFailure * 1000);

//     // Inject failure
//     if (failureType === 'ISTIO_DELAY') {
//       for (const svc of services) {
//         const yaml = `
// apiVersion: networking.istio.io/v1alpha3
// kind: VirtualService
// metadata:
//   name: ${svc}
// spec:
//   hosts:
//     - ${svc}
//   http:
//     - fault:
//         delay:
//           fixedDelay: ${istioDelayMs}ms
//           percentage:
//             value: 100
//       route:
//         - destination:
//             host: ${svc}`;
//         await execPromise(`echo "${yaml}" | kubectl apply -n ${namespace} -f -`);
//       }
//     } else {
//     //   for (const ms of targetMsList) {
//     //     const pod = await execPromise(`kubectl get pods -n ${namespace} -l app=${ms} -o jsonpath="{.items[0].metadata.name}"`);
//     //         const output = await execPromise(`kubectl exec -n ${namespace} ${pod.trim()} -- /bin/sh -c '${failureCmd}'`);
//     // console.log(`[INFO] Fault injection output on pod ${pod.trim()}:`, output);
       
//     //   }
//     for (const ms of targetMsList) {
//   console.log(`[INFO] Processing microservice: ${ms}`);

//   const pod = await execPromise(`kubectl get pods -n ${namespace} -l app=${ms} -o jsonpath="{.items[0].metadata.name}"`);
//   const podName = pod.trim();
//   console.log(`[INFO] Found pod: ${podName} for app: ${ms}`);

//   console.log(`[INFO] Injecting fault in pod ${podName} with command: ${failureCmd}`);

//   const output = await execPromise(`kubectl exec -n ${namespace} ${podName} -- /bin/sh -c '${failureCmd}'`);
//   console.log(`[INFO] Fault injection output on pod ${podName}:`, output);
// }
//     }

//     console.log('[INFO] Failure injected. Waiting for failure duration...');
//     await delay(failureDuration * 1000);

//     // Cleanup
//     if (failureType === 'ISTIO_DELAY') {
//       for (const svc of services) {
//         await execPromise(`kubectl delete VirtualService ${svc} -n ${namespace}`);
//       }
//     } else if (cleanupCmd) {
//       for (const ms of targetMsList) {
//         const pod = await execPromise(`kubectl get pods -n ${namespace} -l app=${ms} -o jsonpath="{.items[0].metadata.name}"`);
//         await execPromise(`kubectl exec -n ${namespace} ${pod.trim()} -- /bin/sh -c '${cleanupCmd}'`);
//       }
//     }

//     // Reset load generator
//   //  await execPromise(`kubectl -n ${namespace} scale deployment loadgenerator --replicas=1`);
//     //
//     // console.log('[INFO] load worked');

//     res.send(`[✅] Experiment complete! Results in ${baseResultsDir}/[...]/${failureType}/${timestamp}/`);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send(`Error during experiment: ${err.message}`);
//   }
// });

// function execPromise(command) {
//   return new Promise((resolve, reject) => {
//     exec(command, (err, stdout, stderr) => {
//       if (err) {
//         reject(new Error(stderr || stdout));
//       } else {
//         resolve(stdout);
//       }
//     });
//   });
// }



// app.post('/inject-fault', async (req, res) => {
//   const {
//     namespace,
//     users,
//     loadDurationMin,
//     failureOption,
//     failureDuration = 300,
//     waitTimeBeforeFailure = 180,
//     cpuWorkers = 2,
//     memSize = '216M',
//     lossPct = 30,
//     delayMs = 200,
//     istioDelayMs = 200,
//     services = [],
//     targetMsList = []
//   } = req.body;

//   const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//   const baseResultsDir = 'results';

//   let failureType = '';
//   let failureCmd = '';
//   let cleanupCmd = '';

//   switch (failureOption) {
//     case 1:
//       failureType = 'CPU';
//       failureCmd = `stress-ng --cpu ${cpuWorkers} --timeout ${failureDuration}`;
//       break;
//     case 2:
//       failureType = 'MEMORY';
//       failureCmd = `stress-ng --vm 1 --vm-bytes ${memSize} --timeout ${failureDuration}`;
//       break;
//     case 3:
//       failureType = 'NETWORK_LOSS';
//       failureCmd = `tc qdisc show dev eth0 | grep -q 'netem' && tc qdisc change dev eth0 root netem loss ${lossPct}% || tc qdisc add dev eth0 root netem loss ${lossPct}%`;
//       cleanupCmd = 'tc qdisc del dev eth0 root 2>/dev/null || true';
//       break;
//     case 4:
//       failureType = 'NETWORK_DELAY';
//       failureCmd = `tc qdisc add dev eth0 root netem delay ${delayMs}ms`;
//       cleanupCmd = 'tc qdisc del dev eth0 root';
//       break;
//     case 5:
//       failureType = 'ISTIO_DELAY';
//       break;
//     default:
//       return res.status(400).send('Invalid failure option');
//   }

//   const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

//   try {
//     // Créer les répertoires de résultats
//     for (const ms of targetMsList) {
//       await execPromise(`mkdir -p ${baseResultsDir}/${ms}/${failureType}/${timestamp}`);
//     }

//     // Démarrer le générateur de charge
//     // await execPromise(`kubectl -n ${namespace} scale deployment loadgenerator --replicas=${users}`);
//     // console.log('[INFO] Load generator scaled');

//     // Attente avant l'injection
//     console.log(`[INFO] Waiting ${waitTimeBeforeFailure}s before injecting failure...`);
//     await delay(waitTimeBeforeFailure * 1000);

//     if (failureType === 'ISTIO_DELAY') {
//       // Injection d’un délai Istio
//       for (const svc of services) {
//         const yaml = `
// apiVersion: networking.istio.io/v1alpha3
// kind: VirtualService
// metadata:
//   name: ${svc}
// spec:
//   hosts:
//     - ${svc}
//   http:
//     - fault:
//         delay:
//           fixedDelay: ${istioDelayMs}ms
//           percentage:
//             value: 100
//       route:
//         - destination:
//             host: ${svc}`;
//         await execPromise(`echo "${yaml}" | kubectl apply -n ${namespace} -f -`);
//       }
//     } else {
//       // Injection dans chaque pod cible
//       for (const ms of targetMsList) {
//         const pod = await execPromise(`kubectl get pods -n ${namespace} -l app=${ms} -o jsonpath="{.items[0].metadata.name}"`);
//         const trimmedPod = pod.trim();

//         console.log(`[INFO] Injecting ${failureType} fault into pod: ${trimmedPod}`);
//         const output = await execPromise(`kubectl exec -n ${namespace} ${trimmedPod} -- /bin/sh -c '${failureCmd}'`);
//         console.log(`[INFO] Fault injection output on pod ${trimmedPod}:`, output);

//         // Sauvegarde dans un fichier (optionnel)
//         await execPromise(`echo "${output}" > ${baseResultsDir}/${ms}/${failureType}/${timestamp}/output.log`);
//       }
//     }

//     console.log('[INFO] Failure injected. Waiting for failure duration...');
//     await delay(failureDuration * 1000);

//     // Nettoyage
//     if (failureType === 'ISTIO_DELAY') {
//       for (const svc of services) {
//         await execPromise(`kubectl delete VirtualService ${svc} -n ${namespace}`);
//       }
//     } else if (cleanupCmd) {
//       for (const ms of targetMsList) {
//         const pod = await execPromise(`kubectl get pods -n ${namespace} -l app=${ms} -o jsonpath="{.items[0].metadata.name}"`);
//         const trimmedPod = pod.trim();
//         await execPromise(`kubectl exec -n ${namespace} ${trimmedPod} -- /bin/sh -c '${cleanupCmd}'`);
//         console.log(`[INFO] Cleanup executed on pod ${trimmedPod}`);
//       }
//     }

//     // Revenir à 1 utilisateur
//    // await execPromise(`kubectl -n ${namespace} scale deployment loadgenerator --replicas=1`);

//     res.send(`[✅] Experiment complete! Results in ${baseResultsDir}/[...]/${failureType}/${timestamp}/`);
//   } catch (err) {
//     console.error('[ERROR]', err);
//     res.status(500).send(`Error during experiment: ${err.message}`);
//   }
// });

// function execPromise(command) {
//   return new Promise((resolve, reject) => {
//     exec(command, (err, stdout, stderr) => {
//       if (err) {
//         reject(new Error(stderr || stdout));
//       } else {
//         resolve(stdout + (stderr ? '\n' + stderr : ''));
//       }
//     });
//   });
// }















































const NAMESPACE = 'molka2';

app.post('/inject-cpu', (req, res) => {
  const { podName, cpuWorkers = 2, duration = 30 } = req.body;

  if (!podName) {
    return res.status(400).json({ error: 'Service name (podName) is required' });
  }

  try {
    // Get real pod name using label "app=podName"
    const getPodCommand = `kubectl get pods -n ${NAMESPACE} -l app=${podName} -o jsonpath='{.items[0].metadata.name}'`;
    console.log(`[+] Resolving pod from service: ${podName}`);
    const resolvedPodName = execSync(getPodCommand, { encoding: 'utf-8' }).trim().replace(/'/g, '');

    if (!resolvedPodName) {
      return res.status(404).json({ error: `No pod found for service "${podName}" in namespace "${NAMESPACE}"` });
    }

    const stressCommand = `kubectl exec -n ${NAMESPACE} ${resolvedPodName} -- stress-ng --cpu ${cpuWorkers} --timeout ${duration}`;
    console.log(`[+] Running command: ${stressCommand}`);
    const result = execSync(stressCommand, { encoding: 'utf-8' });

    res.json({ message: 'CPU stress injected successfully', result });
  } catch (err) {
    console.error('[-] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});













function getScalabilityQueries(namespace) {
  return {
    pod_count: `count(kube_pod_info{namespace="${namespace}"})`,
    container_count: `count(kube_pod_container_info{namespace="${namespace}"})`,
    deployment_count: `count(kube_deployment_labels{namespace="${namespace}"})`,
    replica_count: `sum(kube_deployment_spec_replicas{namespace="${namespace}"})`,
    actual_replicas: `sum(kube_deployment_status_replicas_available{namespace="${namespace}"})`,
  };
}

function getDependencyQueries(namespace) {
  return {
    request_rate: `sum(rate(istio_requests_total{reporter="source", destination_service_namespace="${namespace}"}[5m])) by (source_workload, destination_workload)`,
    error_rate: `sum(rate(istio_requests_total{reporter="source", response_code!~"2..", destination_service_namespace="${namespace}"}[5m])) by (source_workload, destination_workload)`
  };
}

function getResourceQueries(namespace) {
  return {
    cpu_usage: `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}", container!=""}[5m]))`,
    memory_usage: `sum(container_memory_usage_bytes{namespace="${namespace}", container!=""})`,
    cpu_per_pod: `sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="${namespace}", container!=""}[5m]))`,
    mem_per_pod: `sum by (pod) (container_memory_usage_bytes{namespace="${namespace}", container!=""})`
  };
}

function getUptimeQuery(namespace) {
  return `max by(pod) (time() - kube_pod_start_time{namespace="${namespace}"})`;
}

function getNamespacesQuery() {
  return 'count by (namespace) (kube_namespace_labels)';
}

async function queryPrometheus(query) {
  const res = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
    params: { query },
  });
  return res.data.data.result;
}

app.get('/api/namespaces', async (req, res) => {
  try {
    const namespaces = await queryPrometheus(getNamespacesQuery());
    const list = namespaces.map(item => item.metric.namespace);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching namespaces');
  }
});

app.get('/api/report', async (req, res) => {
  const namespace = req.query.namespace || 'default';
  const scalabilityQueries = getScalabilityQueries(namespace);
  const dependencyQueries = getDependencyQueries(namespace);
  const resourceQueries = getResourceQueries(namespace);
  const uptimeQuery = getUptimeQuery(namespace);

  try {
    const [
      podCount,
      containerCount,
      deploymentCount,
      replicas,
      available,
      requestRate,
      errorRate,
      cpuUsage,
      memoryUsage,
      cpuPerPod,
      memPerPod,
      uptime
    ] = await Promise.all([
      queryPrometheus(scalabilityQueries.pod_count),
      queryPrometheus(scalabilityQueries.container_count),
      queryPrometheus(scalabilityQueries.deployment_count),
      queryPrometheus(scalabilityQueries.replica_count),
      queryPrometheus(scalabilityQueries.actual_replicas),
      queryPrometheus(dependencyQueries.request_rate),
      queryPrometheus(dependencyQueries.error_rate),
      queryPrometheus(resourceQueries.cpu_usage),
      queryPrometheus(resourceQueries.memory_usage),
      queryPrometheus(resourceQueries.cpu_per_pod),
      queryPrometheus(resourceQueries.mem_per_pod),
      queryPrometheus(uptimeQuery)
    ]);

    const dependencies = {};
    requestRate.forEach(item => {
      const src = item.metric.source_workload;
      const dst = item.metric.destination_workload;
      const rate = parseFloat(item.value[1]);
      if (!dependencies[src]) dependencies[src] = {};
      dependencies[src][dst] = { rate };
    });

    errorRate.forEach(item => {
      const src = item.metric.source_workload;
      const dst = item.metric.destination_workload;
      const rate = parseFloat(item.value[1]);
      if (dependencies[src] && dependencies[src][dst]) {
        dependencies[src][dst].errors = rate;
      }
    });

    const uptimeData = {};
    uptime.forEach(item => {
      const pod = item.metric.pod;
      const value = parseFloat(item.value[1]);
      uptimeData[pod] = value;
    });

    const cpuPods = {};
    cpuPerPod.forEach(item => {
      cpuPods[item.metric.pod] = parseFloat(item.value[1]);
    });

    const memPods = {};
    memPerPod.forEach(item => {
      memPods[item.metric.pod] = parseFloat(item.value[1]);
    });

    res.json({
      timestamp: new Date(),
      namespace,
      scalability: {
        podCount: podCount[0]?.value[1] ?? 0,
        containerCount: containerCount[0]?.value[1] ?? 0,
        deploymentCount: deploymentCount[0]?.value[1] ?? 0,
        replicaCount: replicas[0]?.value[1] ?? 0,
        actualReplicas: available[0]?.value[1] ?? 0
      },
      resources: {
        cpuUsage: cpuUsage[0]?.value[1] ?? 0,
        memoryUsage: memoryUsage[0]?.value[1] ?? 0,
        cpuPerPod: cpuPods,
        memoryPerPod: memPods
      },
      uptime: uptimeData,
      dependencies
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating report');
  }
});

// function getScalabilityQueries(namespace) {
//   return {
//     pod_count: `count(kube_pod_info{namespace="${namespace}"})`,
//     container_count: `count(kube_pod_container_info{namespace="${namespace}"})`,
//     deployment_count: `count(kube_deployment_labels{namespace="${namespace}"})`,
//     replica_count: `sum(kube_deployment_spec_replicas{namespace="${namespace}"})`,
//     actual_replicas: `sum(kube_deployment_status_replicas_available{namespace="${namespace}"})`,
//   };
// }

// function getDependencyQueries(namespace) {
//   return {
//     request_rate: `sum(rate(istio_requests_total{reporter="source", destination_service_namespace="${namespace}"}[5m])) by (source_workload, destination_workload)`,
//     error_rate: `sum(rate(istio_requests_total{reporter="source", response_code!~"2..", destination_service_namespace="${namespace}"}[5m])) by (source_workload, destination_workload)`
//   };
// }

// async function queryPrometheus(query) {
//   const res = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
//     params: { query },
//   });
//   return res.data.data.result;
// }

// app.get('/api/report', async (req, res) => {
//   const namespace = req.query.namespace || 'default';
//   const scalabilityQueries = getScalabilityQueries(namespace);
//   const dependencyQueries = getDependencyQueries(namespace);

//   try {
//     const [
//       podCount,
//       containerCount,
//       deploymentCount,
//       replicas,
//       available,
//       requestRate,
//       errorRate
//     ] = await Promise.all([
//       queryPrometheus(scalabilityQueries.pod_count),
//       queryPrometheus(scalabilityQueries.container_count),
//       queryPrometheus(scalabilityQueries.deployment_count),
//       queryPrometheus(scalabilityQueries.replica_count),
//       queryPrometheus(scalabilityQueries.actual_replicas),
//       queryPrometheus(dependencyQueries.request_rate),
//       queryPrometheus(dependencyQueries.error_rate),
//     ]);

//     const dependencies = {};
//     requestRate.forEach(item => {
//       const src = item.metric.source_workload;
//       const dst = item.metric.destination_workload;
//       const rate = parseFloat(item.value[1]);
//       if (!dependencies[src]) dependencies[src] = {};
//       dependencies[src][dst] = { rate };
//     });

//     errorRate.forEach(item => {
//       const src = item.metric.source_workload;
//       const dst = item.metric.destination_workload;
//       const rate = parseFloat(item.value[1]);
//       if (dependencies[src] && dependencies[src][dst]) {
//         dependencies[src][dst].errors = rate;
//       }
//     });

//     res.json({
//       timestamp: new Date(),
//       namespace,
//       scalability: {
//         podCount: podCount[0]?.value[1] ?? 0,
//         containerCount: containerCount[0]?.value[1] ?? 0,
//         deploymentCount: deploymentCount[0]?.value[1] ?? 0,
//         replicaCount: replicas[0]?.value[1] ?? 0,
//         actualReplicas: available[0]?.value[1] ?? 0
//       },
//       dependencies
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).send('Error generating report');
//   }
// });


// Configuration statique

// app.post('/run-experiment', (req, res) => {
//   const {
//     namespace,
//     users,
//     loadDurationMin,
//     failureOption,
//     failureDuration = 300,
//     waitTimeBeforeFailure = 180,
//     cpuWorkers = 2,
//     memSize = '216M',
//     lossPct = 30,
//     delayMs = 200,
//     istioDelayMs = 200,
//     services = '',
//     targetMsList
//   } = req.body;

//   const loadDurationSec = loadDurationMin * 60;
//   const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//   const baseResultsDir = 'results';
//   const targetServices = targetMsList.trim().split(/\s+/);
//   const serviceList = services.trim().split(/\s+/);

//   let failureType = '';
//   let failureCmd = '';
//   let cleanupCmd = '';

//   switch (failureOption) {
//     case '1':
//       failureType = 'CPU';
//       failureCmd = `stress-ng --cpu ${cpuWorkers} --timeout ${failureDuration}`;
//       break;
//     case '2':
//       failureType = 'MEMORY';
//       failureCmd = `stress-ng --vm 1 --vm-bytes ${memSize} --timeout ${failureDuration}`;
//       break;
//     case '3':
//       failureType = 'NETWORK_LOSS';
//       failureCmd = `tc qdisc show dev eth0 | grep -q 'netem' && tc qdisc change dev eth0 root netem loss ${lossPct}% || tc qdisc add dev eth0 root netem loss ${lossPct}%`;
//       cleanupCmd = 'tc qdisc del dev eth0 root 2>/dev/null || true';
//       break;
//     case '4':
//       failureType = 'NETWORK_DELAY';
//       failureCmd = `tc qdisc add dev eth0 root netem delay ${delayMs}ms`;
//       cleanupCmd = 'tc qdisc del dev eth0 root';
//       break;
//     case '5':
//       failureType = 'ISTIO_DELAY';
//       break;
//     default:
//       res.status(400).send('Invalid failure option.');
//       return;
//   }

//   // Construct the command to run the experiment
//   let command = `#!/bin/bash\n\n`;
//   command += `TIMESTAMP=${timestamp}\n`;
//   command += `NAMESPACE=${namespace}\n`;
//   command += `USERS=${users}\n`;
//   command += `LOAD_DURATION_MIN=${loadDurationMin}\n`;
//   command += `LOAD_DURATION_SEC=${loadDurationSec}\n`;
//   command += `FAILURE_TYPE=${failureType}\n`;
//   command += `FAILURE_DURATION=${failureDuration}\n`;
//   command += `WAIT_TIME_BEFORE_FAILURE=${waitTimeBeforeFailure}\n`;
//   command += `TARGET_MS_LIST=(${targetServices.join(' ')})\n`;
//   command += `BASE_RESULTS_DIR=${baseResultsDir}\n\n`;

//   command += `mkdir -p "$BASE_RESULTS_DIR"\n\n`;

//   command += `for MS in "\${TARGET_MS_LIST[@]}"; do\n`;
//   command += `  MS_DIR="$BASE_RESULTS_DIR/$MS"\n`;
//   command += `  mkdir -p "$MS_DIR"\n`;
//   command += `  FAILURE_DIR="$MS_DIR/$FAILURE_TYPE"\n`;
//   command += `  mkdir -p "$FAILURE_DIR"\n`;
//   command += `  RUN_DIR="$FAILURE_DIR/$TIMESTAMP"\n`;
//   command += `  mkdir -p "$RUN_DIR"\n`;
//   command += `done\n\n`;

//   command += `START_TIME=$(date +"%Y-%m-%d %H:%M:%S")\n\n`;

//   command += `kubectl -n "$NAMESPACE" scale deployment loadgenerator --replicas="$USERS"\n\n`;

//   command += `sleep "$WAIT_TIME_BEFORE_FAILURE"\n\n`;

//   if (failureType === 'ISTIO_DELAY') {
//     serviceList.forEach(service => {
//       command += `kubectl apply -n "$NAMESPACE" -f - <<EOF\n`;
//       command += `apiVersion: networking.istio.io/v1alpha3\n`;
//       command += `kind: VirtualService\n`;
//       command += `metadata:\n`;
//       command += `  name: ${service}\n`;
//       command += `spec:\n`;
//       command += `  hosts:\n`;
//       command += `    - ${service}\n`;
//       command += `  http:\n`;
//       command += `    - fault:\n`;
//       command += `        delay:\n`;
//       command += `          fixedDelay: ${istioDelayMs}ms\n`;
//       command += `          percentage:\n`;
//       command += `            value: 100\n`;
//       command += `      route:\n`;
//       command += `        - destination:\n`;
//       command += `            host: ${service}\n`;
//       command += `EOF\n\n`;
//     });
//   } else {
//     targetServices.forEach(ms => {
//       command += `POD=$(kubectl get pods -n $NAMESPACE -l app=$ms -o jsonpath='{.items[0].metadata.name}')\n`;
//       command += `kubectl exec -n $NAMESPACE "$POD" -- /bin/sh -c '${failureCmd}' &\n\n`;
//     });
//   }

//   command += `sleep "$FAILURE_DURATION"\n\n`;

//   if (failureType === 'ISTIO_DELAY') {
//     serviceList.forEach(service => {
//       command += `kubectl delete VirtualService "$service" -n "$NAMESPACE"\n\n`;
//     });
//   } else if (failureType === 'NETWORK_LOSS' || failureType === 'NETWORK_DELAY') {
//     targetServices.forEach(ms => {
//       command += `POD=$(kubectl get pods -n $NAMESPACE -l app=$ms -o jsonpath='{.items[0].metadata.name}')\n`;
//       command += `kubectl exec -n $NAMESPACE "$POD" -- sh -c '${cleanupCmd}'\n\n`;
//     });
//   }

//   // Define the path for the script
//   const scriptPath = path.join(__dirname, `experiment-${timestamp}.sh`);

//   // Log that the script is being written
//   console.log(`Writing experiment script to ${scriptPath}`);

//   fs.writeFile(scriptPath, command, { mode: 0o755 }, (err) => {
//     if (err) {
//       console.error('Failed to write script:', err);
//       return res.status(500).send('Failed to create experiment script.');
//     }

//     // Log that the script was written successfully
//     console.log('Experiment script created successfully.');

//     // Execute the script
//     console.log('Executing the experiment script...');
//     exec(`bash "${scriptPath}"`, (error, stdout, stderr) => {
//       if (error) {
//         console.error('Script execution error:', error);
//         return res.status(500).send(`Experiment execution failed:\n${stderr}`);
//       }

//       // Log the experiment output
//       console.log('Experiment output:\n', stdout);
//       res.status(200).send(`Experiment started and completed. Output:\n${stdout}`);
//     });
//   });
// });

// app.post('/run-experiment', (req, res) => {
//   const {
//     namespace,
//     users,
//     loadDurationMin,
//     failureOption,
//     failureDuration = 300,
//     waitTimeBeforeFailure = 180,
//     cpuWorkers = 2,
//     memSize = '216M',
//     lossPct = 30,
//     delayMs = 200,
//     istioDelayMs = 200,
//     services = '',
//     targetMsList
//   } = req.body;

//   const loadDurationSec = loadDurationMin * 60;
//   const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//   const baseResultsDir = 'results';
//   const targetServices = targetMsList.trim().split(/\s+/);
//   const serviceList = services.trim().split(/\s+/);

//   let failureType = '';
//   let failureCmd = '';
//   let cleanupCmd = '';

//   switch (failureOption) {
//     case '1':
//       failureType = 'CPU';
//       failureCmd = `stress-ng --cpu ${cpuWorkers} --timeout ${failureDuration}`;
//       break;
//     case '2':
//       failureType = 'MEMORY';
//       failureCmd = `stress-ng --vm 1 --vm-bytes ${memSize} --timeout ${failureDuration}`;
//       break;
//     case '3':
//       failureType = 'NETWORK_LOSS';
//       failureCmd = `tc qdisc show dev eth0 | grep -q 'netem' && tc qdisc change dev eth0 root netem loss ${lossPct}% || tc qdisc add dev eth0 root netem loss ${lossPct}%`;
//       cleanupCmd = 'tc qdisc del dev eth0 root 2>/dev/null || true';
//       break;
//     case '4':
//       failureType = 'NETWORK_DELAY';
//       failureCmd = `tc qdisc add dev eth0 root netem delay ${delayMs}ms`;
//       cleanupCmd = 'tc qdisc del dev eth0 root';
//       break;
//     case '5':
//       failureType = 'ISTIO_DELAY';
//       break;
//     default:
//       res.status(400).send('Invalid failure option.');
//       return;
//   }

//   // Construct the command to run the experiment
//   let command = `#!/bin/bash\n\n`;
//   command += `TIMESTAMP=${timestamp}\n`;
//   command += `NAMESPACE=${namespace}\n`;
//   command += `USERS=${users}\n`;
//   command += `LOAD_DURATION_MIN=${loadDurationMin}\n`;
//   command += `LOAD_DURATION_SEC=${loadDurationSec}\n`;
//   command += `FAILURE_TYPE=${failureType}\n`;
//   command += `FAILURE_DURATION=${failureDuration}\n`;
//   command += `WAIT_TIME_BEFORE_FAILURE=${waitTimeBeforeFailure}\n`;
//   command += `TARGET_MS_LIST=(${targetServices.join(' ')})\n`;
//   command += `BASE_RESULTS_DIR=${baseResultsDir}\n\n`;

//   command += `mkdir -p "$BASE_RESULTS_DIR"\n\n`;

//   command += `for MS in "\${TARGET_MS_LIST[@]}"; do\n`;
//   command += `  MS_DIR="$BASE_RESULTS_DIR/$MS"\n`;
//   command += `  mkdir -p "$MS_DIR"\n`;
//   command += `  FAILURE_DIR="$MS_DIR/$FAILURE_TYPE"\n`;
//   command += `  mkdir -p "$FAILURE_DIR"\n`;
//   command += `  RUN_DIR="$FAILURE_DIR/$TIMESTAMP"\n`;
//   command += `  mkdir -p "$RUN_DIR"\n`;
//   command += `done\n\n`;

//   command += `START_TIME=$(date +"%Y-%m-%d %H:%M:%S")\n\n`;

//   command += `kubectl -n "$NAMESPACE" scale deployment loadgenerator --replicas="$USERS"\n\n`;

//   command += `sleep "$WAIT_TIME_BEFORE_FAILURE"\n\n`;

//   if (failureType === 'ISTIO_DELAY') {
//     serviceList.forEach(service => {
//       command += `kubectl apply -n "$NAMESPACE" -f - <<EOF\n`;
//       command += `apiVersion: networking.istio.io/v1alpha3\n`;
//       command += `kind: VirtualService\n`;
//       command += `metadata:\n`;
//       command += `  name: ${service}\n`;
//       command += `spec:\n`;
//       command += `  hosts:\n`;
//       command += `    - ${service}\n`;
//       command += `  http:\n`;
//       command += `    - fault:\n`;
//       command += `        delay:\n`;
//       command += `          fixedDelay: ${istioDelayMs}ms\n`;
//       command += `          percentage:\n`;
//       command += `            value: 100\n`;
//       command += `      route:\n`;
//       command += `        - destination:\n`;
//       command += `            host: ${service}\n`;
//       command += `EOF\n\n`;
//     });
//   } else {
//     targetServices.forEach(ms => {
//       command += `POD=$(kubectl get pods -n $NAMESPACE -l app=$ms -o jsonpath='{.items[0].metadata.name}')\n`;
//       command += `kubectl exec -n $NAMESPACE "$POD" -- /bin/sh -c '${failureCmd}' &\n\n`;
//     });
//   }

//   command += `sleep "$FAILURE_DURATION"\n\n`;

//   if (failureType === 'ISTIO_DELAY') {
//     serviceList.forEach(service => {
//       command += `kubectl delete VirtualService "$service" -n "$NAMESPACE"\n\n`;
//     });
//   } else if (failureType === 'NETWORK_LOSS' || failureType === 'NETWORK_DELAY') {
//     targetServices.forEach(ms => {
//       command += `POD=$(kubectl get pods -n $NAMESPACE -l app=$ms -o jsonpath='{.items[0].metadata.name}')\n`;
//       command += `kubectl exec -n $NAMESPACE "$POD" -- sh -c '${cleanupCmd}'\n\n`;
//     });
//   }

//   // Define the path for the script
//   const scriptPath = path.join(__dirname, `experiment-${timestamp}.sh`);

//   // Log that the script is being written
//   console.log(`Writing experiment script to ${scriptPath}`);

//   fs.writeFile(scriptPath, command, { mode: 0o755 }, (err) => {
//     if (err) {
//       console.error('Failed to write script:', err);
//       return res.status(500).send('Failed to create experiment script.');
//     }

//     // Log that the script was written successfully
//     console.log('Experiment script created successfully.');

//     // Log that the experiment script is being executed
//     console.log(`Starting failure type: ${failureType}`);
    
//     exec(`bash "${scriptPath}"`, (error, stdout, stderr) => {
//       if (error) {
//         console.error(`Failure type ${failureType} execution error:`, error);
//         return res.status(500).send(`Experiment execution failed for ${failureType}:\n${stderr}`);
//       }

//       // Log the experiment output
//       console.log(`${failureType} experiment completed successfully. Output:\n`, stdout);
//       res.status(200).send(`${failureType} experiment started and completed. Output:\n${stdout}`);
//     });
//   });
// });


// app.post('/run-experiment', (req, res) => {
//   const {
//     namespace,
//     users,
//     loadDurationMin,
//     failureOption,
//     failureDuration = 300,
//     waitTimeBeforeFailure = 180,
//     cpuWorkers = 2,
//     memSize = '216M',
//     lossPct = 30,
//     delayMs = 200,
//     istioDelayMs = 200,
//     services = '',
//     targetMsList
//   } = req.body;

//   const loadDurationSec = loadDurationMin * 60;
//   const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//   const baseResultsDir = 'results';
//   const targetServices = targetMsList.trim().split(/\s+/);
//   const serviceList = services.trim().split(/\s+/);

//   let failureType = '';
//   let failureCmd = '';
//   let cleanupCmd = '';

//   switch (failureOption) {
//     case '1':
//       failureType = 'CPU';
//       failureCmd = `stress-ng --cpu ${cpuWorkers} --timeout ${failureDuration}`;
//       break;
//     case '2':
//       failureType = 'MEMORY';
//       failureCmd = `stress-ng --vm 1 --vm-bytes ${memSize} --timeout ${failureDuration}`;
//       break;
//     case '3':
//       failureType = 'NETWORK_LOSS';
//       failureCmd = `tc qdisc show dev eth0 | grep -q 'netem' && tc qdisc change dev eth0 root netem loss ${lossPct}% || tc qdisc add dev eth0 root netem loss ${lossPct}%`;
//       cleanupCmd = 'tc qdisc del dev eth0 root 2>/dev/null || true';
//       break;
//     case '4':
//       failureType = 'NETWORK_DELAY';
//       failureCmd = `tc qdisc add dev eth0 root netem delay ${delayMs}ms`;
//       cleanupCmd = 'tc qdisc del dev eth0 root';
//       break;
//     case '5':
//       failureType = 'ISTIO_DELAY';
//       break;
//     default:
//       res.status(400).send('Invalid failure option.');
//       return;
//   }

//   // Construct the command to run the experiment
//   let command = `#!/bin/bash\n\n`;
//   command += `TIMESTAMP=${timestamp}\n`;
//   command += `NAMESPACE=${namespace}\n`;
//   command += `USERS=${users}\n`;
//   command += `LOAD_DURATION_MIN=${loadDurationMin}\n`;
//   command += `LOAD_DURATION_SEC=${loadDurationSec}\n`;
//   command += `FAILURE_TYPE=${failureType}\n`;
//   command += `FAILURE_DURATION=${failureDuration}\n`;
//   command += `WAIT_TIME_BEFORE_FAILURE=${waitTimeBeforeFailure}\n`;
//   command += `TARGET_MS_LIST=(${targetServices.join(' ')})\n`;
//   command += `BASE_RESULTS_DIR=${baseResultsDir}\n\n`;

//   command += `mkdir -p "$BASE_RESULTS_DIR"\n\n`;

//   command += `for MS in "\${TARGET_MS_LIST[@]}"; do\n`;
//   command += `  MS_DIR="$BASE_RESULTS_DIR/$MS"\n`;
//   command += `  mkdir -p "$MS_DIR"\n`;
//   command += `  FAILURE_DIR="$MS_DIR/$FAILURE_TYPE"\n`;
//   command += `  mkdir -p "$FAILURE_DIR"\n`;
//   command += `  RUN_DIR="$FAILURE_DIR/$TIMESTAMP"\n`;
//   command += `  mkdir -p "$RUN_DIR"\n`;
//   command += `done\n\n`;

//   command += `START_TIME=$(date +"%Y-%m-%d %H:%M:%S")\n\n`;

//   command += `kubectl -n "$NAMESPACE" scale deployment loadgenerator --replicas="$USERS"\n\n`;

//   command += `sleep "$WAIT_TIME_BEFORE_FAILURE"\n\n`;

//   if (failureType === 'ISTIO_DELAY') {
//     serviceList.forEach(service => {
//       command += `kubectl apply -n "$NAMESPACE" -f - <<EOF\n`;
//       command += `apiVersion: networking.istio.io/v1alpha3\n`;
//       command += `kind: VirtualService\n`;
//       command += `metadata:\n`;
//       command += `  name: ${service}\n`;
//       command += `spec:\n`;
//       command += `  hosts:\n`;
//       command += `    - ${service}\n`;
//       command += `  http:\n`;
//       command += `    - fault:\n`;
//       command += `        delay:\n`;
//       command += `          fixedDelay: ${istioDelayMs}ms\n`;
//       command += `          percentage:\n`;
//       command += `            value: 100\n`;
//       command += `      route:\n`;
//       command += `        - destination:\n`;
//       command += `            host: ${service}\n`;
//       command += `EOF\n\n`;
//     });
//   } else {
//     targetServices.forEach(ms => {
//       command += `POD=$(kubectl get pods -n $NAMESPACE -l app=$ms -o jsonpath='{.items[0].metadata.name}')\n`;
//       command += `if [ -z "$POD" ]; then\n`;
//       command += `  echo "No pod found for app=$ms in namespace $NAMESPACE"\n`;
//       command += `  exit 1\n`;
//       command += `fi\n`;
//       command += `kubectl exec -n $NAMESPACE "$POD" -- /bin/sh -c '${failureCmd}' &\n\n`;
//     });
//   }

//   command += `sleep "$FAILURE_DURATION"\n\n`;

//   if (failureType === 'ISTIO_DELAY') {
//     serviceList.forEach(service => {
//       command += `kubectl delete VirtualService "$service" -n "$NAMESPACE"\n\n`;
//     });
//   } else if (failureType === 'NETWORK_LOSS' || failureType === 'NETWORK_DELAY') {
//     targetServices.forEach(ms => {
//       command += `POD=$(kubectl get pods -n $NAMESPACE -l app=$ms -o jsonpath='{.items[0].metadata.name}')\n`;
//       command += `if [ -z "$POD" ]; then\n`;
//       command += `  echo "No pod found for app=$ms in namespace $NAMESPACE"\n`;
//       command += `  exit 1\n`;
//       command += `fi\n`;
//       command += `kubectl exec -n $NAMESPACE "$POD" -- sh -c '${cleanupCmd}'\n\n`;
//     });
//   }

//   // Define the path for the script
//   const scriptPath = path.join(__dirname, `experiment-${timestamp}.sh`);

//   // Log that the script is being written
//   console.log(`Writing experiment script to ${scriptPath}`);

//   fs.writeFile(scriptPath, command, { mode: 0o755 }, (err) => {
//     if (err) {
//       console.error('Failed to write script:', err);
//       return res.status(500).send('Failed to create experiment script.');
//     }

//     // Log that the script was written successfully
//     console.log('Experiment script created successfully.');

//     // Log that the experiment script is being executed
//     console.log(`Starting failure type: ${failureType}`);
    
//     exec(`bash "${scriptPath}"`, (error, stdout, stderr) => {
//       if (error) {
//         console.error(`Failure type ${failureType} execution error:`, error);
//         return res.status(500).send(`Experiment execution failed for ${failureType}:\n${stderr}`);
//       }

//       // Log the experiment output
//       console.log(`${failureType} experiment completed successfully. Output:\n`, stdout);
//       res.status(200).send(`${failureType} experiment started and completed. Output:\n${stdout}`);
//     });
//   });
// });



//const  execPromise= util.promisify(exec);

// Helper functions
async function createResultsDirs(services, failureType, timestamp) {
  try {
    await fs.mkdir(BASE_RESULTS_DIR, { recursive: true });
    
    for (const service of services) {
      const serviceDir = path.join(BASE_RESULTS_DIR, service);
      const failureDir = path.join(serviceDir, failureType);
      const runDir = path.join(failureDir, timestamp);
      
      await fs.mkdir(runDir, { recursive: true });
    }
  } catch (err) {
    throw new Error(`Failed to create results directories: ${err.message}`);
  }
}

async function saveParams(services, failureType, timestamp, params) {
  try {
    for (const service of services) {
      const runDir = path.join(BASE_RESULTS_DIR, service, failureType, timestamp);
      const paramsFile = path.join(runDir, 'params.csv');
      
      const csvHeader = 'start_time,end_time,namespace,users,load_duration_mins,failure_type,failure_duration,target_service,failure_params\n';
      const csvRow = `"${params.startTime}","${params.endTime}","${params.namespace}",${params.users},${params.loadDurationMin},"${failureType}",${params.failureDuration},"${service}","${params.failureCmd}"\n`;
      
      await fs.writeFile(paramsFile, csvHeader + csvRow);
    }
  } catch (err) {
    throw new Error(`Failed to save parameters: ${err.message}`);
  }
}

async function scaleLoadGenerator(namespace, replicas) {
  try {
    await execPromise(`kubectl -n ${namespace} scale deployment loadgenerator --replicas=${replicas}`);
  } catch (err) {
    throw new Error(`Failed to scale loadgenerator: ${err.stderr}`);
  }
}

async function injectFailure(namespace, failureType, targetServices, failureParams) {
  try {
    if (failureType === 'ISTIO_DELAY') {
      for (const service of failureParams.services) {
        const vsConfig = `
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: ${service}
spec:
  hosts:
    - ${service}
  http:
    - fault:
        delay:
          fixedDelay: ${failureParams.delayMs}ms
          percentage:
            value: 100
      route:
        - destination:
            host: ${service}
`;
        await execPromise(`kubectl apply -n ${namespace} -f -`, { input: vsConfig });
      }
    } else {
      for (const service of targetServices) {
        const pod = (await execPromise(`kubectl get pods -n ${namespace} -l app=${service} -o jsonpath='{.items[0].metadata.name}'`)).stdout.trim();
        if (!pod) throw new Error(`No pod found for app=${service} in namespace ${namespace}`);
        
        await execPromise(`kubectl exec -n ${namespace} ${pod} -- /bin/sh -c '${failureParams.cmd}'`);
      }
    }
  } catch (err) {
    throw new Error(`Failure injection failed: ${err.stderr || err.message}`);
  }
}

async function cleanupFailure(namespace, failureType, targetServices, cleanupParams) {
  try {
    if (failureType === 'ISTIO_DELAY') {
      for (const service of cleanupParams.services) {
        await execPromise(`kubectl delete VirtualService ${service} -n ${namespace}`);
      }
    } else if (failureType === 'NETWORK_LOSS' || failureType === 'NETWORK_DELAY') {
      for (const service of targetServices) {
        const pod = (await execPromise(`kubectl get pods -n ${namespace} -l app=${service} -o jsonpath='{.items[0].metadata.name}'`)).stdout.trim();
        if (!pod) throw new Error(`No pod found for app=${service} in namespace ${namespace}`);
        
        await execPromise(`kubectl exec -n ${namespace} ${pod} -- sh -c '${cleanupParams.cmd}'`);
      }
    }
  } catch (err) {
    throw new Error(`Failure cleanup failed: ${err.stderr || err.message}`);
  }
}

async function collectMetrics(params) {
  try {
    const pythonScript = path.join(__dirname, 'collect_metrics.py');
    const args = [
      `--prometheus_url "${PROMETHEUS_URL}"`,
      `--start_time "${params.startTime}"`,
      `--end_time "${params.endTime}"`,
      `--namespace "${params.namespace}"`,
      `--target_services "${params.targetServices.join(' ')}"`,
      `--base_dir "${BASE_RESULTS_DIR}"`,
      `--failure_type "${params.failureType}"`,
      `--timestamp "${params.timestamp}"`
    ];
    
    await execPromise(`python3 ${pythonScript} ${args.join(' ')}`);
  } catch (err) {
    throw new Error(`Metrics collection failed: ${err.stderr || err.message}`);
  }
}

async function collectAdditionalData(namespace, startTime, endTime, service, failureType, timestamp) {
  try {
    const runDir = path.join(BASE_RESULTS_DIR, service, failureType, timestamp);
    
    // Collect pod events
    await execPromise(`python3 event_by_start_end_ns.py --namespace ${namespace} --start "${startTime}" --end "${endTime}" --output "${path.join(runDir, 'pod_events.csv')}"`);
    
    // Collect resource consumption
    await execPromise(`python3 resources_by_start_end_ns.py --namespace ${namespace} --start "${startTime}" --end "${endTime}" --file_resource "${path.join(runDir, 'pod_resource_consumption.csv')}" --file_baro "${path.join(runDir, 'pod_resource_baro.csv')}"`);
    
    // Collect communication data
    await execPromise(`python3 communication_by_start_end_ns.py --namespace ${namespace} --start "${startTime}" --end "${endTime}" --output "${path.join(runDir, 'pod_communication.csv')}"`);
  } catch (err) {
    console.error(`Additional data collection failed for ${service}: ${err.stderr || err.message}`);
  }
}

// API Endpoint
app.post('/run-experiment', async (req, res) => {
  try {
    const {
      namespace,
      users,
      loadDurationMin,
      failureOption,
      failureDuration = 300,
      waitTimeBeforeFailure = 180,
      cpuWorkers = 2,
      memSize = '216M',
      lossPct = 30,
      delayMs = 200,
      istioDelayMs = 200,
      services = [],
      targetMsList = []
    } = req.body;

    // Validate inputs
    if (!namespace || !users || !loadDurationMin || !failureOption || !targetMsList.length) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    if (failureOption === '5' && (!services || !services.length)) {
      return res.status(400).json({ error: 'Services required for Istio delay' });
    }

    const loadDurationSec = loadDurationMin * 60;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const targetServices = Array.isArray(targetMsList) ? targetMsList : targetMsList.split(/\s+/);
    const serviceList = Array.isArray(services) ? services : services.split(/\s+/);

    let failureType, failureParams, cleanupParams;
    
    // Set failure parameters based on option
    switch (failureOption.toString()) {
      case '1':
        failureType = 'CPU';
        failureParams = { cmd: `stress-ng --cpu ${cpuWorkers} --timeout ${failureDuration}` };
        break;
      case '2':
        failureType = 'MEMORY';
        failureParams = { cmd: `stress-ng --vm 1 --vm-bytes ${memSize} --timeout ${failureDuration}` };
        break;
      case '3':
        failureType = 'NETWORK_LOSS';
        failureParams = { cmd: `tc qdisc show dev eth0 | grep -q 'netem' && tc qdisc change dev eth0 root netem loss ${lossPct}% || tc qdisc add dev eth0 root netem loss ${lossPct}%` };
        cleanupParams = { cmd: 'tc qdisc del dev eth0 root 2>/dev/null || true' };
        break;
      case '4':
        failureType = 'NETWORK_DELAY';
        failureParams = { cmd: `tc qdisc add dev eth0 root netem delay ${delayMs}ms` };
        cleanupParams = { cmd: 'tc qdisc del dev eth0 root' };
        break;
      case '5':
        failureType = 'ISTIO_DELAY';
        failureParams = { services: serviceList, delayMs: istioDelayMs };
        cleanupParams = { services: serviceList };
        break;
      default:
        return res.status(400).json({ error: 'Invalid failure option' });
    }

    // Create results directories
    await createResultsDirs(targetServices, failureType, timestamp);

    const startTime = new Date().toISOString().replace('T', ' ').replace(/\..+/, '');

    // Scale up load generator
    await scaleLoadGenerator(namespace, users);
    
    // Wait before failure injection
    await new Promise(resolve => setTimeout(resolve, waitTimeBeforeFailure * 1000));

    // Inject failure
    await injectFailure(namespace, failureType, targetServices, failureParams);
    
    // Wait for failure duration
    await new Promise(resolve => setTimeout(resolve, failureDuration * 1000));

    // Cleanup failure
    if (cleanupParams) {
      await cleanupFailure(namespace, failureType, targetServices, cleanupParams);
    }

    const endTime = new Date().toISOString().replace('T', ' ').replace(/\..+/, '');

    // Save parameters
    await saveParams(targetServices, failureType, timestamp, {
      startTime,
      endTime,
      namespace,
      users,
      loadDurationMin,
      failureDuration,
      failureCmd: failureParams.cmd || `Istio delay: ${istioDelayMs}ms on ${serviceList.join(', ')}`
    });

    // Collect metrics and additional data
    await collectMetrics({
      startTime,
      endTime,
      namespace,
      targetServices,
      failureType,
      timestamp
    });

    // Collect additional data for each service
    for (const service of targetServices) {
      await collectAdditionalData(namespace, startTime, endTime, service, failureType, timestamp);
    }

    // Scale down load generator
    await scaleLoadGenerator(namespace, 1);

    // Prepare response
    const results = targetServices.map(service => ({
      service,
      path: `${service}/${failureType}/${timestamp}`,
      metrics: `${BASE_RESULTS_DIR}/${service}/${failureType}/${timestamp}/metrics.csv`,
      params: `${BASE_RESULTS_DIR}/${service}/${failureType}/${timestamp}/params.csv`
    }));

    res.json({
      success: true,
      message: 'Experiment completed successfully',
      startTime,
      endTime,
      results
    });

  } catch (error) {
    console.error('Experiment failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Experiment failed'
    });
  }
});





app.get('/metricstest', async (req, res) => {
  const { namespace, start, end } = req.query;
  if (!namespace || !start || !end) {
    return res.status(400).send('Missing required query parameters');
  }

  try {
    const data = await getMetrics(namespace, start, end);
    res.json(data);
  } catch (err) {
    res.status(500).send('Error fetching metrics: ' + err.message);
  }
});



app.get('/api/collect-metrics', async (req, res) => {
  // Parse query parameters with proper type conversion
  const namespace = req.query.namespace || 'molka';
  const users = parseInt(req.query.users) || 100;
  const load_duration_min = parseInt(req.query.load_duration_min) || 5;
  const failure_type = req.query.failure_type || 'CPU';
  const failure_duration = parseInt(req.query.failure_duration) || 300;
  const wait_before_failure = parseInt(req.query.wait_before_failure) || 180;
  
  // Convert comma-separated string to array
  let target_services = [];
  if (req.query.target_services) {
    target_services = Array.isArray(req.query.target_services) 
      ? req.query.target_services 
      : req.query.target_services.split(',');
  } else {
    target_services = ['frontend', 'recommendation']; // default services
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const start_time = new Date();
  const end_time = new Date(start_time.getTime() + (load_duration_min * 60 * 1000));

  try {
    // Create directory structure
    const baseDir = path.join(__dirname, 'results');
    target_services.forEach(service => {
      const serviceDir = path.join(baseDir, service, failure_type, timestamp);
      if (!fs.existsSync(serviceDir)) {
        fs.mkdirSync(serviceDir, { recursive: true });
      }
    });

    // ... rest of your existing code ...
    
    res.json({
      status: 'success',
      message: 'Metrics collected successfully',
      data: {
        baseDir,
        services: target_services,
        failure_type,
        timestamp,
        start_time: start_time.toISOString(),
        end_time: end_time.toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error collecting metrics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to collect metrics',
      error: error.message,
      received_services_param: req.query.target_services, // For debugging
      parsed_services: target_services // For debugging
    });
  }
});








































app.get('/api/graph-data2', async (req, res) => {
  const namespace = req.query.namespace || 'molka2';
  const timeWindow = parseInt(req.query.timeWindow, 10) || 60; // Default to 60 seconds
  const endISO = req.query.end || new Date().toISOString();
  const startISO = new Date(new Date(endISO).getTime() - timeWindow * 1000).toISOString();

  // Validate dates
  if (!startISO) {
    console.error('Missing start date');
    return res.status(400).json({ error: 'Missing start date' });
  }

  const startDate = new Date(startISO);
  const endDate = new Date(endISO);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.error('Invalid date format:', { startISO, endISO });
    return res.status(400).json({ error: 'Invalid date format' });
  }

  if (startDate >= endDate) {
    console.error('Start date is after end date:', { startISO, endISO });
    return res.status(400).json({ error: 'Start date must be before end date' });
  }

  const start = Math.floor(startDate.getTime() / 1000);
  const end = Math.floor(endDate.getTime() / 1000);
  const step = Math.max(1, Math.floor(timeWindow / 60)); // Dynamic step based on timeWindow, minimum 1 second

  try {
    // Request rate query
    const requestRateQuery = `
      sum(rate(istio_requests_total{
        reporter="source",
        source_workload_namespace="${namespace}",
        destination_service_namespace="${namespace}",
        response_code!~"0"
      }[1m])) by (source_workload, destination_workload, destination_service_namespace)
    `;

    // Request duration query
    const durationQuery = `
      sum(rate(istio_request_duration_milliseconds_sum{
        reporter="source",
        source_workload_namespace="${namespace}",
        destination_service_namespace="${namespace}"
      }[1m])) by (source_workload, destination_workload, destination_service_namespace)
      /
      sum(rate(istio_request_duration_milliseconds_count{
        reporter="source",
        source_workload_namespace="${namespace}",
        destination_service_namespace="${namespace}"
      }[1m])) by (source_workload, destination_workload, destination_service_namespace)
    `;

    // Error rate query
    const errorRateQuery = `
      (
        sum(rate(istio_requests_total{
          reporter="source",
          source_workload_namespace="${namespace}",
          destination_service_namespace="${namespace}",
          response_code=~"4..|5.."
        }[1m])) by (source_workload, destination_workload, destination_service_namespace)
      )
      /
      (
        sum(rate(istio_requests_total{
          reporter="source",
          source_workload_namespace="${namespace}",
          destination_service_namespace="${namespace}",
          response_code!~"0"
        }[1m])) by (source_workload, destination_workload, destination_service_namespace)
      ) or vector(0)
    `;

    // Execute Prometheus queries with query_range
    console.log('Executing Prometheus queries:', { requestRateQuery, durationQuery, errorRateQuery });
    const [reqRes, durRes, errRes] = await Promise.all([
      axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
        params: {
          query: requestRateQuery,
          start,
          end,
          step,
        },
      }),
      axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
        params: {
          query: durationQuery,
          start,
          end,
          step,
        },
      }),
      axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
        params: {
          query: errorRateQuery,
          start,
          end,
          step,
        },
      }),
    ]);

    // Function to calculate average over range
    const averageOverRange = (result) => {
      if (!result?.data?.result?.[0]?.values?.length) {
        return null;
      }
      const values = result.data.result[0].values;
      const sum = values.reduce((acc, [, value]) => acc + Number(value), 0);
      return sum / values.length;
    };

    const dataMap = {};

    // Process request rates
    if (reqRes?.data?.data?.result?.length) {
      reqRes.data.data.result.forEach(({ metric, values }) => {
        const source = metric.source_workload || 'unknown';
        const destination = metric.destination_workload || 'unknown';
        const key = `${source}-${destination}`;
        const avg = averageOverRange({ data: { result: [{ values }] } });
        dataMap[key] = {
          source,
          destination,
          namespace: metric.destination_service_namespace || namespace,
          request_rate: avg !== null ? Number(avg.toFixed(2)) : 0,
          response_time_ms: 0,
          error_rate: 0,
        };
      });
    }

    // Process durations
    if (durRes?.data?.data?.result?.length) {
      durRes.data.data.result.forEach(({ metric, values }) => {
        const source = metric.source_workload || 'unknown';
        const destination = metric.destination_workload || 'unknown';
        const key = `${source}-${destination}`;
        const avg = averageOverRange({ data: { result: [{ values }] } });
        if (dataMap[key]) {
          dataMap[key].response_time_ms = avg !== null ? Number(avg.toFixed(2)) : 0;
        } else {
          dataMap[key] = {
            source,
            destination,
            namespace: metric.destination_service_namespace || namespace,
            request_rate: 0,
            response_time_ms: avg !== null ? Number(avg.toFixed(2)) : 0,
            error_rate: 0,
          };
        }
      });
    }

    // Process error rates
    if (errRes?.data?.data?.result?.length) {
      errRes.data.data.result.forEach(({ metric, values }) => {
        const source = metric.source_workload || 'unknown';
        const destination = metric.destination_workload || 'unknown';
        const key = `${source}-${destination}`;
        const avg = averageOverRange({ data: { result: [{ values }] } });
        const errorRate = avg !== null ? Number((avg * 100).toFixed(2)) : 0; // Convert to percentage
        if (dataMap[key]) {
          dataMap[key].error_rate = errorRate;
        } else {
          dataMap[key] = {
            source,
            destination,
            namespace: metric.destination_service_namespace || namespace,
            request_rate: 0,
            response_time_ms: 0,
            error_rate: errorRate,
          };
        }
      });
    }

    // Convert dataMap to array
    const result = Object.values(dataMap);
    console.log('API response:', result);

    // Return empty array if no data
    res.json(result.length > 0 ? result : []);
  } catch (err) {
    console.error('❌ Error querying Prometheus:', err.message);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

























































// app.get('/api/graph-data2', async (req, res) => {
//   const namespace = req.query.namespace || 'molka2';
//   const timeWindow = parseInt(req.query.timeWindow, 10) || 60; // Default to 60s

//   // Validation du timeWindow
//   if (![15, 30, 45, 60, 90, 120, 150, 180, 210, 240].includes(timeWindow)) {
//     console.error('Invalid time window:', timeWindow);
//     return res.status(400).json({ error: 'Invalid time window. Must be one of: 15, 30, 45, 60, 90, 120, 150, 180, 210, 240 seconds' });
//   }

//   const end = Math.floor(Date.now() / 1000); // Current time in seconds
//   const start = end - timeWindow; // Start time based on timeWindow
//   const step = Math.max(5, Math.floor(timeWindow / 20)); // Finer step size for more data points

//   try {
//     // Use a minimum range for rate to ensure enough data points
//     const rateInterval = Math.max(timeWindow, 30); // Minimum 30s for rate to avoid empty results

//     // Requête pour le taux de requêtes (aligned with working query)
//     const requestRateQuery = `
//   sum(rate(istio_requests_total{
//     source_workload_namespace="${namespace}",
//     destination_service_namespace="${namespace}",
//     response_code!~"0"
//   }[${rateInterval}s])) by (source_workload, destination_workload, destination_service_namespace)
// `;


//     // Requête pour la durée moyenne des requêtes
//     const durationQuery = `
//       sum(rate(istio_request_duration_milliseconds_sum{
//         reporter="source",
//         source_workload_namespace="${namespace}",
//         destination_service_namespace="${namespace}"
//       }[${rateInterval}s])) by (source_workload, destination_workload, destination_service_namespace)
//       /
//       sum(rate(istio_request_duration_milliseconds_count{
//         reporter="source",
//         source_workload_namespace="${namespace}",
//         destination_service_namespace="${namespace}"
//       }[${rateInterval}s])) by (source_workload, destination_workload, destination_service_namespace)
//     `;

//     // Requête pour le taux d'erreur
//     const errorRateQuery = `
//       (
//         sum(rate(istio_requests_total{
//           reporter="source",
//           source_workload_namespace="${namespace}",
//           destination_service_namespace="${namespace}",
//           response_code=~"4..|5.."
//         }[${rateInterval}s])) by (source_workload, destination_workload, destination_service_namespace)
//       )
//       /
//       (
//         sum(rate(istio_requests_total{
//           reporter="source",
//           source_workload_namespace="${namespace}",
//           destination_service_namespace="${namespace}",
//           response_code!~"0"
//         }[${rateInterval}s])) by (source_workload, destination_workload, destination_service_namespace)
//       ) or vector(0)
//     `;

//     // Exécuter les requêtes Prometheus
//     console.log('Executing Prometheus queries:', { requestRateQuery, durationQuery, errorRateQuery, start, end, step });
//     const [reqRes, durRes, errRes] = await Promise.all([
//       axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
//         params: {
//           query: requestRateQuery,
//           start,
//           end,
//           step,
//         },
//       }),
//       axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
//         params: {
//           query: durationQuery,
//           start,
//           end,
//           step,
//         },
//       }),
//       axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
//         params: {
//           query: errorRateQuery,
//           start,
//           end,
//           step,
//         },
//       }),
//     ]);

//     // Log raw Prometheus responses for debugging
//     console.log('Prometheus responses:', {
//       requestRate: {
//         resultCount: reqRes?.data?.data?.result?.length || 0,
//         sampleResult: reqRes?.data?.data?.result?.[0] || null,
//       },
//       duration: {
//         resultCount: durRes?.data?.data?.result?.length || 0,
//         sampleResult: durRes?.data?.data?.result?.[0] || null,
//       },
//       errorRate: {
//         resultCount: errRes?.data?.data?.result?.length || 0,
//         sampleResult: errRes?.data?.data?.result?.[0] || null,
//       },
//     });

//     // Fonction pour calculer la moyenne sur une plage de valeurs
//     const averageOverRange = (result) => {
//       if (!result?.data?.data?.result?.length) {
//         console.log('No data in Prometheus result:', result?.data?.data);
//         return 0; // Default to 0 instead of null
//       }
//       // Process each series
//       const allValues = result.data.data.result.flatMap(series => {
//         if (!series.values?.length) {
//           console.log('No values in series:', series.metric);
//           return [];
//         }
//         return series.values.map(([, value]) => Number(value)).filter(val => !isNaN(val));
//       });
//       if (!allValues.length) {
//         console.log('No valid values in Prometheus series');
//         return 0; // Default to 0 if no valid values
//       }
//       const sum = allValues.reduce((acc, val) => acc + val, 0);
//       return sum / allValues.length;
//     };

//     const dataMap = {};

//     // Traiter les taux de requêtes
//     if (reqRes?.data?.data?.result?.length) {
//       reqRes.data.data.result.forEach(({ metric, values }) => {
//         const source = metric.source_workload || 'unknown';
//         const destination = metric.destination_workload || 'unknown';
//         const key = `${source}-${destination}`;
//         const avg = averageOverRange({ data: { result: [{ values }] } });
//         dataMap[key] = {
//           source,
//           destination,
//           request_rate: Number(avg.toFixed(2)),
//           response_time_ms: 0,
//           error_rate: 0,
//         };
//       });
//     }

//     // Traiter les durées
//     if (durRes?.data?.data?.result?.length) {
//       durRes.data.data.result.forEach(({ metric, values }) => {
//         const source = metric.source_workload || 'unknown';
//         const destination = metric.destination_workload || 'unknown';
//         const key = `${source}-${destination}`;
//         const avg = averageOverRange({ data: { result: [{ values }] } });
//         if (dataMap[key]) {
//           dataMap[key].response_time_ms = Number(avg.toFixed(2));
//         } else {
//           dataMap[key] = {
//             source,
//             destination,
//             request_rate: 0,
//             response_time_ms: Number(avg.toFixed(2)),
//             error_rate: 0,
//           };
//         }
//       });
//     }

//     // Traiter les taux d'erreur
//     if (errRes?.data?.data?.result?.length) {
//       errRes.data.data.result.forEach(({ metric, values }) => {
//         const source = metric.source_workload || 'unknown';
//         const destination = metric.destination_workload || 'unknown';
//         const key = `${source}-${destination}`;
//         const avg = averageOverRange({ data: { result: [{ values }] } });
//         const errorRate = Number((avg * 100).toFixed(2)); // Convertir en pourcentage
//         if (dataMap[key]) {
//           dataMap[key].error_rate = errorRate;
//         } else {
//           dataMap[key] = {
//             source,
//             destination,
//             request_rate: 0,
//             response_time_ms: 0,
//             error_rate: errorRate,
//           };
//         }
//       });
//     }

//     // Convertir dataMap en tableau
//     const result = Object.values(dataMap);
//     console.log('Final API response:', result);

//     // Renvoyer un tableau vide si aucune donnée
//     res.json(result.length > 0 ? result : []);
//   } catch (err) {
//     console.error('❌ Error querying Prometheus:', err.message, err.stack);
//     res.status(500).json({ error: 'Failed to fetch metrics' });
//   }
// });










// Helper pour faire une requête range à Prometheus
// async function queryPrometheusRange(query, start, end, step = '30s') {
//   const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
//     params: {
//       query,
//       start,
//       end,
//       step,
//     }
//   });
//   return response.data.data.result;
// }

// // Calcul de la moyenne des valeurs retournées par Prometheus sur la plage
// function averageOverRange(result) {
//   if (!result || result.length === 0) return null;

//   // result est un tableau de séries, chaque série a un tableau de valeurs [timestamp, value]
//   // On fait la moyenne de toutes les valeurs de toutes les séries
//   let sum = 0;
//   let count = 0;

//   result.forEach(series => {
//     series.values.forEach(([ts, value]) => {
//       sum += parseFloat(value);
//       count++;
//     });
//   });

//   return count > 0 ? sum / count : null;
// }



















app.get('/api/graph-data', async (req, res) => {
  const namespace = req.query.namespace || 'molka2';
  const startISO = req.query.start;
  const endISO = req.query.end || new Date().toISOString();

  // Validation des dates
  if (!startISO) {
    console.error('Missing start date');
    return res.status(400).json({ error: 'Missing start date' });
  }

  const startDate = new Date(startISO);
  const endDate = new Date(endISO);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.error('Invalid date format:', { startISO, endISO });
    return res.status(400).json({ error: 'Invalid date format' });
  }

  if (startDate >= endDate) {
    console.error('Start date is after end date:', { startISO, endISO });
    return res.status(400).json({ error: 'Start date must be before end date' });
  }

  const start = Math.floor(startDate.getTime() / 1000);
  const end = Math.floor(endDate.getTime() / 1000);
  const step = 60; // Intervalle de 60 secondes pour les requêtes range

  try {
    // Requête pour le taux de requêtes
    const requestRateQuery = `
      sum(rate(istio_requests_total{
        reporter="source",
        source_workload_namespace="${namespace}",
        destination_service_namespace="${namespace}",
        response_code!~"0"
      }[1m])) by (source_workload, destination_workload, destination_service_namespace)
    `;

    // Requête pour la durée moyenne des requêtes
    const durationQuery = `
      sum(rate(istio_request_duration_milliseconds_sum{
        reporter="source",
        source_workload_namespace="${namespace}",
        destination_service_namespace="${namespace}"
      }[1m])) by (source_workload, destination_workload, destination_service_namespace)
      /
      sum(rate(istio_request_duration_milliseconds_count{
        reporter="source",
        source_workload_namespace="${namespace}",
        destination_service_namespace="${namespace}"
      }[1m])) by (source_workload, destination_workload, destination_service_namespace)
    `;

    // Requête pour le taux d'erreur
    const errorRateQuery = `
      (
        sum(rate(istio_requests_total{
          reporter="source",
          source_workload_namespace="${namespace}",
          destination_service_namespace="${namespace}",
          response_code=~"4..|5.."
        }[1m])) by (source_workload, destination_workload, destination_service_namespace)
      )
      /
      (
        sum(rate(istio_requests_total{
          reporter="source",
          source_workload_namespace="${namespace}",
          destination_service_namespace="${namespace}",
          response_code!~"0"
        }[1m])) by (source_workload, destination_workload, destination_service_namespace)
      ) or vector(0)
    `;

    // Exécuter les requêtes Prometheus avec query_range
    console.log('Executing Prometheus queries:', { requestRateQuery, durationQuery, errorRateQuery });
    const [reqRes, durRes, errRes] = await Promise.all([
      axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
        params: {
          query: requestRateQuery,
          start,
          end,
          step,
        },
      }),
      axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
        params: {
          query: durationQuery,
          start,
          end,
          step,
        },
      }),
      axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
        params: {
          query: errorRateQuery,
          start,
          end,
          step,
        },
      }),
    ]);

    // Fonction pour calculer la moyenne sur une plage de valeurs
    const averageOverRange = (result) => {
      if (!result?.data?.result?.[0]?.values?.length) {
        return null;
      }
      const values = result.data.result[0].values;
      const sum = values.reduce((acc, [, value]) => acc + Number(value), 0);
      return sum / values.length;
    };

    const dataMap = {};

    // Traiter les taux de requêtes
    if (reqRes?.data?.data?.result?.length) {
      reqRes.data.data.result.forEach(({ metric, values }) => {
        const source = metric.source_workload || 'unknown';
        const destination = metric.destination_workload || 'unknown';
        const key = `${source}-${destination}`;
        const avg = averageOverRange({ data: { result: [{ values }] } });
        dataMap[key] = {
          source,
          destination,
          namespace: metric.destination_service_namespace || namespace,
          request_rate: avg !== null ? Number(avg.toFixed(2)) : 0,
          response_time_ms: 0,
          error_rate: 0,
        };
      });
    }

    // Traiter les durées
    if (durRes?.data?.data?.result?.length) {
      durRes.data.data.result.forEach(({ metric, values }) => {
        const source = metric.source_workload || 'unknown';
        const destination = metric.destination_workload || 'unknown';
        const key = `${source}-${destination}`;
        const avg = averageOverRange({ data: { result: [{ values }] } });
        if (dataMap[key]) {
          dataMap[key].response_time_ms = avg !== null ? Number(avg.toFixed(2)) : 0;
        } else {
          dataMap[key] = {
            source,
            destination,
            namespace: metric.destination_service_namespace || namespace,
            request_rate: 0,
            response_time_ms: avg !== null ? Number(avg.toFixed(2)) : 0,
            error_rate: 0,
          };
        }
      });
    }

    // Traiter les taux d'erreur
    if (errRes?.data?.data?.result?.length) {
      errRes.data.data.result.forEach(({ metric, values }) => {
        const source = metric.source_workload || 'unknown';
        const destination = metric.destination_workload || 'unknown';
        const key = `${source}-${destination}`;
        const avg = averageOverRange({ data: { result: [{ values }] } });
        const errorRate = avg !== null ? Number((avg * 100).toFixed(2)) : 0; // Convertir en pourcentage
        if (dataMap[key]) {
          dataMap[key].error_rate = errorRate;
        } else {
          dataMap[key] = {
            source,
            destination,
            namespace: metric.destination_service_namespace || namespace,
            request_rate: 0,
            response_time_ms: 0,
            error_rate: errorRate,
          };
        }
      });
    }

    // Convertir dataMap en tableau
    const result = Object.values(dataMap);
    console.log('API response:', result);

    // Renvoyer un tableau vide si aucune donnée
    res.json(result.length > 0 ? result : []);
  } catch (err) {
    console.error('❌ Error querying Prometheus:', err.message);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Fonction pour calculer la moyenne sur une plage de valeurs
function averageOverRange(result) {
  if (!result?.data?.result?.[0]?.values?.length) {
    return null;
  }

  const values = result.data.result[0].values;
  const sum = values.reduce((acc, [, value]) => acc + Number(value), 0);
  return sum / values.length;
}








































// app.post('/inject', (req, res) => {
//   const namespace = req.body.namespace;
//   const microservice = req.body.microservice;
//   const delay = req.body.delay;

//   // 1. Check for missing values (like in Bash)
//   if (!namespace || !microservice || !delay) {
//     return res.status(400).send("Missing required fields");
//   }

//   // 2. Create YAML file (like echo + cat in Bash)
//   const yaml = `
// apiVersion: networking.istio.io/v1alpha3
// kind: VirtualService
// metadata:
//   name: ${microservice}-fault-injection
//   namespace: ${namespace}
// spec:
//   hosts:
//   - ${microservice}
//   http:
//   - fault:
//       delay:
//         fixedDelay: ${delay}ms
//         percentage:
//           value: 100
//     route:
//     - destination:
//         host: ${microservice}
// `;

//   fs.writeFile('/tmp/fault-injection.yml', yaml, (err) => {
//     if (err) {
//       return res.status(500).send("Failed to write YAML file");
//     }

//     // 3. Apply the fault (same as `kubectl apply`)
//     exec("kubectl apply -f /tmp/fault-injection.yml", (error, stdout, stderr) => {
//       if (error) {
//         return res.status(500).send(`Error: ${stderr}`);
//       }
//       return res.send(`✅ Injected ${delay}ms delay into ${microservice} in namespace ${namespace}`);
//     });
//   });
// });






//////////////   inject with choosing the amount of time the delay will last//////////////
// app.post('/inject', (req, res) => {
//   const namespace = req.body.namespace;
//   const microservice = req.body.microservice;
//   const delay = req.body.delay;
//   const duration = req.body.duration || 30000; // Default 30 seconds if not specified

//   // 1. Check for missing values
//   if (!namespace || !microservice || !delay) {
//     return res.status(400).send("Missing required fields");
//   }

//   // 2. Create YAML file
//   const yaml = `
// apiVersion: networking.istio.io/v1alpha3
// kind: VirtualService
// metadata:
//   name: ${microservice}-fault-injection
//   namespace: ${namespace}
// spec:
//   hosts:
//   - ${microservice}
//   http:
//   - fault:
//       delay:
//         fixedDelay: ${delay}ms
//         percentage:
//           value: 100
//     route:
//     - destination:
//         host: ${microservice}
// `;

//   fs.writeFile('/tmp/fault-injection.yml', yaml, (err) => {
//     if (err) {
//       return res.status(500).send("Failed to write YAML file");
//     }

//     // 3. Apply the fault
//     exec("kubectl apply -f /tmp/fault-injection.yml", (error, stdout, stderr) => {
//       if (error) {
//         return res.status(500).send(`Error applying fault: ${stderr}`);
//       }

//       // 4. Schedule automatic removal after specified duration
//       setTimeout(() => {
//         exec(`kubectl delete virtualservice ${microservice}-fault-injection -n ${namespace}`, 
//           (deleteError, deleteStdout, deleteStderr) => {
//             if (deleteError) {
//               console.error(`Failed to remove fault injection: ${deleteStderr}`);
//             } else {
//               console.log(`✅ Automatically removed ${delay}ms delay from ${microservice} after ${duration/1000} seconds`);
//             }
//           });
//       }, duration);

//       return res.send(`✅ Injected ${delay}ms delay into ${microservice} for ${duration/1000} seconds in namespace ${namespace}`);
//     });
//   });
// });




const activeInjections = {}; 
// Track active injections if needed

app.post('/inject', (req, res) => {
  const namespace = req.body.namespace;
  const microservice = req.body.microservice;
  const delay = req.body.delay;
  const duration = parseInt(req.body.duration) || 30000; // Default 30 seconds
  const activationDelay = parseInt(req.body.activationDelay) || 0;
  
  // 1. Check for missing values
  if (!namespace || !microservice || !delay) {
    return res.status(400).send("Missing required fields");
  }

  // 2. Create YAML content
  const yaml = `
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: ${microservice}-fault-injection
  namespace: ${namespace}
spec:
  hosts:
  - ${microservice}
  http:
  - fault:
      delay:
        fixedDelay: ${delay}ms
        percentage:
          value: 100
    route:
    - destination:
        host: ${microservice}
`;

  // 3. Define the function to apply the fault
  const applyFault = () => {
    fs.writeFile('/tmp/fault-injection.yml', yaml, (err) => {
      if (err) {
        return res.status(500).send("Failed to write YAML file");
      }

      exec("kubectl apply -f /tmp/fault-injection.yml", (error, stdout, stderr) => {
        if (error) {
          return res.status(500).send(`Error applying fault: ${stderr}`);
        }

        const removalTimeout = setTimeout(() => {
          exec(`kubectl delete virtualservice ${microservice}-fault-injection -n ${namespace}`,
            (deleteError, deleteStdout, deleteStderr) => {
              if (deleteError) {
                console.error(`Failed to remove fault injection: ${deleteStderr}`);
              } else {
                console.log(`✅ Automatically removed ${delay}ms delay from ${microservice} after ${duration / 1000} seconds active time`);
              }
            });
        }, duration);

        activeInjections[`${namespace}-${microservice}`] = {
          timeout: removalTimeout,
          startTime: new Date(Date.now() + activationDelay),
          endTime: new Date(Date.now() + activationDelay + duration)
        };

        console.log(`✅ Injected ${delay}ms delay into ${microservice} after ${activationDelay / 1000}s`);

        return res.send({
          message: `⏳ Will inject ${delay}ms delay into ${microservice} in ${namespace} after ${activationDelay / 1000}s for ${duration / 1000}s.`,
          activationTime: new Date(Date.now() + activationDelay).toISOString(),
          removalTime: new Date(Date.now() + activationDelay + duration).toISOString()
        });
      });
    });
  };

  // 🕒 Apply the fault after the desired activation delay
  setTimeout(applyFault, activationDelay);
});











// **************************remove fault ***********************************
app.post('/remove-fault', (req, res) => {
  const { namespace, microservice } = req.body;

  const resourceName = `${microservice}-fault-injection`; // ou ce que tu as utilisé pour le nom de la ressource
  const command = `kubectl delete -n ${namespace} virtualservice ${resourceName}`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(stderr);
      return res.status(500).send(`❌ Failed to remove fault: ${stderr}`);
    }
    return res.send(`✅ Fault removed for ${microservice} in namespace ${namespace}`);
  });
});

// *************************************************************
async function loadGraph(namespace, start, end) {
  // This is the actual query to fetch the data from Prometheus
  const query = `istio_requests_total{source_workload_namespace="${namespace}"}`;

  try {
    // Using the query_range API to get data for the given namespace and time range
    const url = `http://raphtory03:9090/api/v1/query_range?query=${encodeURIComponent(query)}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}&step=15s`;

    // Fetch data from Prometheus
    const response = await fetch(url);
    const result = await response.json();

    // Prepare nodes and links for the graph
    const nodes = new Set();
    const links = [];

    // Parse the Prometheus response to extract the nodes and links
    result.data.result.forEach(item => {
      const source = item.metric.source_service;
      const target = item.metric.destination_service;
      
      if (source && target) {
        nodes.add(source);
        nodes.add(target);
        links.push({ source, target });
      }
    });

    // Return nodes and links for rendering the graph
    return { nodes: [...nodes].map(id => ({ id })), links };
  } catch (err) {
    console.error("Failed to load graph data", err);
    throw err;
  }
}
// ************************************************************************************

// The route to fetch graph data for a namespace
app.get("/api/graph/:namespace", async (req, res) => {
  const namespace = req.params.namespace;
  
  // Define the time range (last 24 hours)
  const start = Date.now() - 24 * 60 * 60 * 1000;  // 1 day ago
  const end = Date.now();  // Current time

  try {
    // Call the loadGraph function with the given namespace and time range
    const graphData = await loadGraph(namespace, start, end);
    
    // Send the graph data as a JSON response
    res.json(graphData);
  } catch (err) {
    console.error("Error fetching graph data", err);
    res.status(500).json({ error: "Failed to fetch graph data" });
  }
});

// ***********************************************************************************
// app.post('/stress-cpu', (req, res) => {
//   const namespace = req.body.namespace;
//   const targetMicroservices = req.body.targetMicroservices; // Array of microservices
//   const cpuWorkers = req.body.cpuWorkers || 2;
//   const duration = req.body.duration || 300;

//   // 1. Check for missing values
//   if (!namespace || !targetMicroservices || !targetMicroservices.length) {
//     return res.status(400).send("Missing required fields: namespace and/or targetMicroservices");
//   }

//   // 2. Process each microservice
//   const promises = targetMicroservices.map(ms => {
//     return new Promise((resolve, reject) => {
//       // Get the first pod for the microservice
//       exec(`kubectl get pods -n ${namespace} -l app=${ms} -o jsonpath='{.items[0].metadata.name}'`, 
//         (error, podName, stderr) => {
//           if (error) {
//             reject(`Failed to get pod for ${ms}: ${stderr}`);
//             return;
//           }

//           // Inject CPU stress
//           exec(`kubectl exec -n ${namespace} ${podName} -- /bin/sh -c "stress-ng --cpu ${cpuWorkers} --timeout ${duration}"`,
//             (execError, stdout, execStderr) => {
//               if (execError) {
//                 reject(`Failed to inject stress into ${ms}: ${execStderr}`);
//                 return;
//               }
//               resolve(`[✅] CPU stress injected into ${ms} for ${duration} seconds`);
//             });
//         });
//     });
//   });

//   // 3. Handle all promises
//   Promise.all(promises)
//     .then(results => {
//       res.status(200).json({
//         message: `CPU stress injected for ${duration} seconds`,
//         details: results
//       });
//     })
//     .catch(error => {
//       res.status(500).send(error);
//     });
// });

// // Helper functions
// function getPodName(namespace, microservice) {
//   return new Promise((resolve, reject) => {
//     exec(`kubectl get pods -n ${namespace} -l app=${microservice} -o jsonpath='{.items[0].metadata.name}'`, 
//       (error, stdout, stderr) => {
//         if (error) return reject(stderr);
//         resolve(stdout.trim());
//       }
//     );
//   });
// }

// function injectCPULoad(namespace, podName, cpuWorkers, duration) {
//   return new Promise((resolve, reject) => {
//     exec(`kubectl exec -n ${namespace} ${podName} -- /bin/sh -c "stress-ng --cpu ${cpuWorkers} --timeout ${duration}"`,
//       (error, stdout, stderr) => {
//         if (error) return reject(stderr);
//         resolve(stdout);
//       }
//     );
//   });
// }

// // Routes
// app.post('/stress-cpu', async (req, res) => {
//   try {
//     const { namespace, targetMicroservices, cpuWorkers = 2, duration = 300 } = req.body;
    
//     // Validate input
//     if (!namespace || !targetMicroservices?.length) {
//       return res.status(400).json({ error: "Namespace and at least one microservice are required" });
//     }

//     // Process each microservice
//     const results = [];
//     for (const ms of targetMicroservices) {
//       try {
//         const podName = await getPodName(namespace, ms);
//         await injectCPULoad(namespace, podName, cpuWorkers, duration);
//         results.push(`CPU stress injected into ${ms} (${cpuWorkers} workers for ${duration}s)`);
//       } catch (error) {
//         results.push(`Failed to inject into ${ms}: ${error}`);
//       }
//     }

//     res.json({ 
//       success: true,
//       message: `CPU stress injected for ${duration} seconds`,
//       details: results
//     });
//   } catch (error) {
//     res.status(500).json({ 
//       success: false,
//       error: error.message 
//     });
//   }
// });

// app.post('/stop-stress', (req, res) => {
//   const { namespace } = req.body;
  
//   if (!namespace) {
//     return res.status(400).json({ error: "Namespace is required" });
//   }

//   // This is a simplified version - you might need a more sophisticated way to track and kill processes
//   exec(`kubectl get pods -n ${namespace} -o jsonpath='{.items[*].metadata.name}' | xargs -I {} kubectl exec -n ${namespace} {} -- pkill stress-ng`,
//     (error, stdout, stderr) => {
//       if (error) {
//         return res.status(500).json({ 
//           success: false,
//           error: stderr 
//         });
//       }
//       res.json({ 
//         success: true,
//         message: "Stopped all stress processes in namespace"
//       });
//     }
//   );
// });





// Remove packet loss
app.post('/remove-packet-loss', (req, res) => {
  const { namespace, podName } = req.body;

  if (!namespace || !podName) {
    return res.status(400).send("Missing required fields: namespace, podName");
  }

  // Remove `tc` rules
  const command = `kubectl exec -n ${namespace} ${podName} -- tc qdisc del dev eth0 root`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).send(`Failed to remove packet loss: ${stderr}`);
    }
    res.send(`✅ Removed packet loss from pod ${podName} (Namespace: ${namespace})`);
  });
});






app.post('/inject-network-loss', (req, res) => {
  const namespace = req.body.namespace;
  const microservice = req.body.microservice;
  const percentage = req.body.percentage; // This should be a number between 0-100

  // 1. Check for missing values
  if (!namespace || !microservice || !percentage) {
    return res.status(400).send("Missing required fields");
  }

  // Validate percentage is between 0-100
  if (percentage < 0 || percentage > 100) {
    return res.status(400).send("Percentage must be between 0 and 100");
  }

  const yaml = `
  apiVersion: networking.istio.io/v1alpha3
  kind: VirtualService
  metadata:
    name:  ${microservice}-fault-injection
    namespace: ${namespace}
  spec:
    hosts:
    - ${microservice}
    http:
    - fault:
        delay:
          percentage:
            value: 100
          fixedDelay: 2s
        abort:
          percentage:
            value: ${percentage}
          httpStatus: 503
      route:
      - destination:
          host: ${microservice}
  `;

  fs.writeFile('/tmp/fault-injection2.yml', yaml, (err) => {
    if (err) {
      return res.status(500).send("Failed to write YAML file");
    }

    // 3. Apply the fault
    exec("kubectl apply -f /tmp/fault-injection2.yml", (error, stdout, stderr) => {
      if (error) {
        return res.status(500).send(`Error: ${stderr}`);
      }
      return res.send(`✅ Injected ${percentage}% network loss into ${microservice} in namespace ${namespace}`);
    });
  });
});



















// app.post('/inject-network-loss', (req, res) => {
//   const namespace = req.body.namespace;
//   const microservice = req.body.microservice;
//   const percentage = req.body.percentage; // This should be a number between 0-100

//   // 1. Check for missing values
//   if (!namespace || !microservice || !percentage) {
//     return res.status(400).send("Missing required fields");
//   }

//   // Validate percentage is between 0-100
//   if (percentage < 0 || percentage > 100) {
//     return res.status(400).send("Percentage must be between 0 and 100");
//   }

//   // 2. Create YAML file for network loss
//   const yaml = `
// apiVersion: networking.istio.io/v1alpha3
// kind: VirtualService
// metadata:
//   name: ${microservice}-fault-injection
//   namespace: ${namespace}
// spec:
//   hosts:
//   - ${microservice}
//   http:
//   - fault:
//       abort:
//         httpStatus: 503
//         percentage:
//           value: ${percentage}
//     route:
//     - destination:
//         host: ${microservice}
// `;

//   fs.writeFile('/tmp/fault-injection2.yml', yaml, (err) => {
//     if (err) {
//       return res.status(500).send("Failed to write YAML file");
//     }

//     // 3. Apply the fault
//     exec("kubectl apply -f /tmp/fault-injection2.yml", (error, stdout, stderr) => {
//       if (error) {
//         return res.status(500).send(`Error: ${stderr}`);
//       }
//       return res.send(`✅ Injected ${percentage}% network loss into ${microservice} in namespace ${namespace}`);
//     });
//   });
// });

// **************************remove fault ***********************************
app.post('/remove-fault-network-loss', (req, res) => {
  const { namespace, microservice } = req.body;

  const resourceName = `${microservice}-fault-injection`;
  const command = `kubectl delete -n ${namespace} virtualservice ${resourceName}`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(stderr);
      return res.status(500).send(`❌ Failed to remove fault: ${stderr}`);
    }
    return res.send(`✅ Fault removed for ${microservice} in namespace ${namespace}`);
  });
});






















// ////////////////////
// app.post('/inject-pod-delay', async (req, res) => {
//   try {
//     const { namespace, microservice, delay = '200ms', duration = 300 } = req.body;

//     // Validate input
//     if (!namespace || !microservice) {
//       return res.status(400).json({ 
//         error: "Missing parameters",
//         required: ["namespace", "microservice"],
//         received: req.body
//       });
//     }

//     // Get pod name
//     const getPodCmd = `kubectl get pod -n ${namespace} -l app=${microservice} -o jsonpath='{.items[0].metadata.name}'`;
//     const podName = await new Promise((resolve, reject) => {
//       exec(getPodCmd, (error, stdout, stderr) => {
//         if (error) reject(new Error(`Pod lookup failed: ${stderr}`));
//         resolve(stdout.trim());
//       });
//     });

//     // Inject delay
//     const tcInjectCmd = `kubectl exec -n ${namespace} ${podName} -- tc qdisc add dev eth0 root netem delay ${delay}`;
//     await new Promise((resolve, reject) => {
//       exec(tcInjectCmd, (error, stdout, stderr) => {
//         if (error) reject(new Error(`Delay injection failed: ${stderr}`));
//         resolve();
//       });
//     });

//     // Schedule cleanup
//     setTimeout(() => {
//       const tcCleanCmd = `kubectl exec -n ${namespace} ${podName} -- tc qdisc del dev eth0 root`;
//       exec(tcCleanCmd, (error) => {
//         if (error) console.error(`⚠️ Auto-cleanup failed for ${podName}`);
//       });
//     }, duration * 1000);

//     res.json({
//       success: true,
//       message: `✅ Injected ${delay} delay into pod ${podName}`,
//       pod: podName,
//       duration: `${duration} seconds`
//     });

//   } catch (error) {
//     console.error('Error in /inject-pod-delay:', error.message);
//     res.status(500).json({
//       error: "Failed to inject delay",
//       details: error.message,
//       troubleshooting: [
//         "1. Verify pod has tc command (iproute2 package)",
//         "2. Check container has NET_ADMIN capabilities",
//         "3. Confirm correct network interface name"
//       ]
//     });
//   }
// });

app.post('/inject-stress', async (req, res) => {
  const { namespace, microservice, memory, duration } = req.body;

  // Step 1: Get the pod name
  exec(`kubectl get pod -n ${namespace} -l app=${microservice} -o jsonpath="{.items[0].metadata.name}"`, (err, stdout) => {
    if (err) return res.send(`❌ Error fetching pod: ${err.message}`);
    const pod = stdout.trim();

    // Step 2: Get the node name where the pod is running
    exec(`kubectl get pod ${pod} -n ${namespace} -o jsonpath="{.spec.nodeName}"`, (err2, stdout2) => {
      if (err2) return res.send(`❌ Error getting node: ${err2.message}`);
      const node = stdout2.trim();

      const stressPodName = `mem-stress-${Date.now()}`;
      const cmd = `
kubectl run ${stressPodName} \
  -n ${namespace} \
  --image=ghcr.io/chaos-mesh/stress-ng:latest \
  --overrides='{
    "apiVersion": "v1",
    "spec": {
      "nodeName": "${node}",
      "restartPolicy": "Never",
      "containers": [{
        "name": "stress",
        "image": "ghcr.io/chaos-mesh/stress-ng:latest",
        "command": ["stress-ng"],
        "args": ["--vm", "1", "--vm-bytes", "${memory}", "--timeout", "${duration}s"]
      }]
    }
  }' --restart=Never`;

      exec(cmd, (err3, stdout3, stderr3) => {
        if (err3) {
          return res.send(`❌ Error injecting stress: ${stderr3 || err3.message}`);
        }
        res.send(`✅ Memory stress pod ${stressPodName} launched on node ${node} for ${duration}s with ${memory} RAM.`);
      });
    });
  });
});






app.get('/events', (req, res) => {
  const ns = req.query.namespace;
  const allEvents = getEvents();
  const filtered = ns ? allEvents.filter(e => e.namespace === ns) : allEvents;
  res.json(filtered);
});

 const port = 3000;

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
}).on('error', (err) => {
  console.error(`❌ Error starting server on port ${port}:`, err.message);
});



// app.listen(3017, '0.0.0.0', () => {
//   console.log('Server running on 0.0.0.0:3017');
// });




































// const express = require('express');
// const bodyParser = require('body-parser');
// const fs = require('fs');
// const { exec } = require('child_process');
// const util = require('util');
// const path = require('path');

// const app = express();
// const execPromise = util.promisify(exec);

// // Middleware - removed cors since it's causing issues
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.static(path.join(__dirname, 'public')));

// // Fault Injection Function
// async function runFaultInjection(namespace, param1, param2, injectionDuration, delayMs, services) {
//     try {
//         // Validate input
//         if (!namespace || !param1 || !param2 || !injectionDuration || !delayMs || !services || services.length === 0) {
//             throw new Error("Missing required parameters");
//         }

//         console.log(`Starting experiment with namespace: ${namespace}, param1: ${param1}, param2: ${param2}`);

//         // Step 1: Start the experiment
//         await execPromise(`./launch_experiment.sh ${namespace} ${param1} ${param2}`);

//         // Step 2: Wait before applying failure injection
//         console.log("Waiting for 3 minutes before applying failure injection...");
//         await new Promise(resolve => setTimeout(resolve, 180000));

//         // Step 3: Apply failure injection
//         for (const service of services) {
//             console.log(`Injecting failure into service: ${service} with ${delayMs}ms delay...`);
            
//             const virtualServiceYaml = `
// apiVersion: networking.istio.io/v1alpha3
// kind: VirtualService
// metadata:
//   name: ${service}
//   namespace: ${namespace}
// spec:
//   hosts:
//     - ${service}
//   http:
//     - fault:
//         delay:
//           fixedDelay: ${delayMs}ms
//           percentage:
//             value: 100
//       route:
//         - destination:
//             host: ${service}
// `;
//             fs.writeFileSync(`/tmp/${service}-fault.yaml`, virtualServiceYaml);
//             await execPromise(`kubectl apply -f /tmp/${service}-fault.yaml -n ${namespace}`);
//             fs.unlinkSync(`/tmp/${service}-fault.yaml`);
//         }

//         console.log(`Failure injection applied to services: ${services.join(', ')}`);

//         // Step 4: Wait for the defined duration
//         console.log(`Waiting for ${injectionDuration} seconds...`);
//         await new Promise(resolve => setTimeout(resolve, injectionDuration * 1000));

//         // Step 5: Remove the failure injection
//         for (const service of services) {
//             console.log(`Removing failure injection from service: ${service}...`);
//             await execPromise(`kubectl delete VirtualService ${service} -n ${namespace}`);
//         }

//         return { success: true, message: "Experiment completed successfully" };

//     } catch (error) {
//         console.error("Error during fault injection:", error);
//         throw error;
//     }
// }

// // API Endpoint
// app.post('/api/fault-injection', async (req, res) => {
//     try {
//         const { namespace, param1, param2, injectionDuration, delayMs, services } = req.body;
        
//         if (!namespace || !param1 || !param2 || !injectionDuration || !delayMs || !services) {
//             return res.status(400).json({ error: "Missing required parameters" });
//         }

//         const result = await runFaultInjection(
//             namespace,
//             param1,
//             param2,
//             parseInt(injectionDuration),
//             parseInt(delayMs),
//             Array.isArray(services) ? services : [services]
//         );

//         res.json(result);
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

// // Serve HTML
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'remove.html'));
// });

// // Start server
// const PORT = process.env.PORT || 3001;
// app.listen(PORT, () => {
//     console.log(`Server running on http://localhost:${PORT}`);
// });