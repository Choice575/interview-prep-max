# Swfuse additions (15.7.0)

The existing question bank already used topics from Swfuse/devops-interview.
This release adds 60 independently written questions: 30 based on the technical
guide and 30 based on company interview scenarios. It is a curated supplement,
not a verbatim or exhaustive copy of the repository. HR advice, personal salary
notes and repetitions of existing prompts were not imported.

Source: https://github.com/Swfuse/devops-interview/tree/6ac2d8620c87352c4c0f3c115e0352a1e6552ca4
Reviewed: 2026-09-21. Upstream did not declare a license; its answer prose and
images are not redistributed. The manifest stores original application text
and links to the relevant upstream file or section.

`swfuse.json` is the editable manifest. Stable bank, exam and card IDs are explicit.
Run `node scripts/import-swfuse.js` to synchronize the three datasets, or add
`--check` to verify synchronization without writing. Import refuses unrelated ID
collisions and duplicate prompts. Previously published question records are
retained; new options are balanced without reshuffling existing questions.

The bank contains 331 questions, the exam 921, and flashcards 3434 across both
decks. Additions stay in the study deck and use the existing flat categories.
Search for Swfuse in cards and exam, or within the selected bank category.

Selected primary references used to check technical details:

- Docker commit and mounted volumes: https://docs.docker.com/reference/cli/docker/container/commit/
- Python containers: https://docs.python.org/3/tutorial/datastructures.html
- Python generators: https://docs.python.org/3/tutorial/classes.html#generators
- Linux scheduling policies: https://man7.org/linux/man-pages/man7/sched.7.html
- TLS SNI: https://www.rfc-editor.org/rfc/rfc6066#section-3
- StatefulSet updates: https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/
- PersistentVolume access modes: https://kubernetes.io/docs/concepts/storage/persistent-volumes/
- Kubernetes upgrades: https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/
- Certificates: https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/
- Admission webhooks: https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/
- EKS Anywhere: https://anywhere.eks.amazonaws.com/docs/overview/
- EC2 lifecycle: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html
- IAM boundaries: https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html
- S3 gateway endpoints: https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html
- GitLab manual jobs: https://docs.gitlab.com/ci/jobs/job_control/
- Kafka KRaft: https://kafka.apache.org/41/operations/kraft/
- Ansible magic variables: https://docs.ansible.com/ansible/latest/reference_appendices/special_variables.html
- Kyverno: https://kyverno.io/docs/introduction/
- Kubespray: https://github.com/kubernetes-sigs/kubespray
- Trivy failures: https://trivy.dev/docs/latest/references/troubleshooting/
