# Russian question wording

Use Russian prose. Give the English technical term in parentheses on its first
mention within a question and answer. Keep product names, command syntax,
configuration identifiers and literal diagnostics intact. Translate full
sentences when word replacement would break grammar or hide an important nuance.

`../localize-question-prose.js` contains reviewed grammatical phrase replacements.
`russian-wording.json` contains complete editorial rewrites for mixed-language
passages. Run `node scripts/localize-question-prose.js --check` to verify that the
committed datasets are current; omit `--check` to apply the reviewed wording.
This is a bounded editorial pass, not a general-purpose machine translator.
New content still requires human-language review, especially noun cases and
ambiguous English words used as code identifiers.

Scope of 15.9.0: 832 study cards, 41 video cards, 76 multiple-choice records and
11 question-bank records. All IDs and source metadata remain stable. The Swfuse
manifest stays synchronized. Technical terms outside the reviewed phrases remain
available for later editorial passes; this release does not claim a complete
translation of every English phrase in the corpus.

During the Ansible handler rewrite, an overly broad statement that handlers never
execute in check mode was corrected: behavior depends on module support. Reference:
https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html
