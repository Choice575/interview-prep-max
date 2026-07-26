const REQUIRED_TERMS_BY_WEEK = new Map([
  [9, ['Harbor', 'Nexus']],
  [10, ['Jenkins']],
  [11, ['OpenTofu']],
  [12, ['Yandex Cloud']],
  [18, ['Gateway API', 'HTTPRoute']],
  [19, ['Helm']],
  [20, ['VictoriaMetrics', 'Argo CD']],
  [21, ['Grafana Alloy', 'OpenTelemetry', 'Promtail']],
  [22, ['OpenTelemetry']],
  [23, ['Trivy', 'SBOM', 'Cosign']],
  [30, ['Longhorn', 'Ceph']],
]);

function findMissingRequiredTerms(week) {
  const requiredTerms = REQUIRED_TERMS_BY_WEEK.get(week && week.week) || [];
  const weekText = JSON.stringify(week || {});
  return requiredTerms.filter(term => !weekText.includes(term));
}

module.exports = { REQUIRED_TERMS_BY_WEEK, findMissingRequiredTerms };
