# Проверка содержания 15.10.1

Аудит выявил пять неверных ключей Terraform: ID 9 (состояние), 11 (удалённый backend), 14 (дрейф конфигурации), 18 (модули), 26 (свежий план перед работой). Правильные ответы согласованы с пояснениями. ID не менялись. Карточка 1002052 о дрейфе уже описывает расхождение фактического состояния с кодом корректно, поэтому менять её не потребовалось. Прежняя оценка не пересчитывается без сохранённого варианта ответа; приложение помечает ранее пройденные вопросы к пересдаче.

Шесть заданий тренажёров переписаны там, где ошибка находилась в самом условии:

- `k8s#6`: для нового образа с тегом `latest` политика скачивания по умолчанию — `Always`; риск устаревшего образа создаёт явное `IfNotPresent` с изменяемым тегом. Также добавлены отсутствовавшие метки шаблона Pod.
- `k8s#8`: при трёх репликах `maxUnavailable: 25%` округляется до нуля, при четырёх — до одного. Условие теперь требует сохранить четыре доступные реплики.
- `ansible_pb#5`: `with_items` работает; список пакетов прямо в `apt.name` эффективнее последовательных вызовов.
- `ansible_pb#8`: символ `|` в середине YAML-скаляра допустим. Реальная проблема — привязка проверки корневой файловой системы к `/dev/sda1`.
- `dockerfile#10`: `EXPOSE 5000` корректен и подразумевает TCP, но не публикует порт. Задание теперь проверяет порядок слоёв `COPY` и установки зависимостей.
- `code#14`: `set_fact` допустим в обработчике Ansible; отдельному обработчику нужно уведомление. `ansible_date_time` хранит время сбора фактов, а `now(utc=true)` вычисляет текущий момент.

Первичные источники: [состояние Terraform](https://developer.hashicorp.com/terraform/language/state/purpose), [хранение состояния и блокировка](https://developer.hashicorp.com/terraform/language/state/backends), [удалённое состояние](https://developer.hashicorp.com/terraform/language/state/remote), [модули](https://developer.hashicorp.com/terraform/language/modules/develop), [скачивание образов Kubernetes](https://kubernetes.io/docs/concepts/containers/images/), [обновление Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/), [модуль apt](https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/apt_module.html), [циклы Ansible](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_loops.html), [обработчики Ansible](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_handlers.html), [функция now](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_templating_now.html), [Dockerfile](https://docs.docker.com/reference/dockerfile/).
