const axios = require('axios');
const dayjs = require('dayjs');

const PROM_URL = 'http://raphtory03:9090';

async function queryRange(metric, namespace, start, end) {
  const query = `sum(rate(${metric}{namespace="${namespace}", container!="POD", container!=""}[1m])) by (pod,instance)`;
  const response = await axios.get(`${PROM_URL}/api/v1/query_range`, {
    params: {
      query,
      start: dayjs(start).toISOString(),
      end: dayjs(end).toISOString(),
      step: '15s',
    },
  });

  if (response.data.status !== 'success') throw new Error('Prometheus query failed');

  return response.data.data.result;
}

async function getMetrics(namespace, start, end) {
  const metrics = [
    'container_cpu_usage_seconds_total',
    'container_memory_working_set_bytes',
    'container_network_transmit_packets_total',
  ];

  const results = {};

  for (const metric of metrics) {
    const series = await queryRange(metric, namespace, start, end);
    results[metric] = series.map(entry => ({
      pod: entry.metric.pod,
      instance: entry.metric.instance,
      values: entry.values.map(([ts, value]) => ({
        timestamp: new Date(ts * 1000),
        value: parseFloat(value),
      })),
    }));
  }

  return results;
}

module.exports = { getMetrics };
