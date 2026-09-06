/* ============================================================
   launch.js — Milestones 8-10 (задачи по шаблону, назначение исполнителей,
   итоговый отчёт запуска).

   НЕ портировано из mvp-ветки — там эти milestone'ы не реализованы вообще
   (solution/PLAN.md на feature/add_mvp_solution: "Milestones 8-11 — по
   плану, ещё не реализованы"). Спроектировано заново для этой демонстрации,
   но по тем же принципам простоты, что описаны в PLAN.md#контекст:
   "продвинутое распределение исполнителей (нагрузка/навыки/отсутствия/SLA)
   — только round-robin", "создание задач по шаблону" без ML сверх
   необходимого — детерминированные правила, как и весь остальной движок.

   Работает НАД уже посчитанным window.LPC.validateAll (читает
   row._classifyResult/_matchedCompanyId/_validationOk/_validationIssues,
   которые validateAll уже проставляет на каждую строку) — отдельного
   прогона не требует.
   ============================================================ */

/** Задачи по шаблону для КОНКРЕТНОГО типа проекта — просто фильтр+сортировка
 * справочника (Milestone 8). Ничего не выдумывается: ровно те ~30 задач,
 * что определены в templates.js для этого template_project_type. */
function buildTaskPlan(projectType, templates) {
  if (!projectType) return [];
  return (templates || [])
    .filter((t) => t.template_project_type === projectType)
    .map((t) => ({
      code: t.template_task_code,
      name: t.template_task_name,
      stage: t.template_stage,
      order: Number(t.template_order) || 0,
      durationHours: Number(t.template_duration_hours) || 0,
      requiredRole: t.template_required_role,
      requiredSkills: t.template_required_skills,
      predecessorCode: t.template_predecessor_code || null,
      mandatory: t.template_mandatory === '1',
    }))
    .sort((a, b) => a.order - b.order);
}

/**
 * Назначение исполнителей — round-robin по роли (Milestone 9), НЕ по нагрузке/навыкам/SLA —
 * так решено в PLAN.md сознательно ("продвинутое распределение — отдельный будущий шаг").
 * Кандидаты на роль — активные сотрудники со совпадающим employee_role, по кругу в порядке
 * справочника; счётчик по роли общий на весь отчёт (одна и та же заявка не получает того же
 * человека на все свои задачи подряд, если кандидатов на роль несколько).
 */
function createRoundRobinAssigner(employees) {
  const byRole = new Map();
  (employees || []).forEach((e) => {
    if (e.employee_active === '0') return;
    if (!byRole.has(e.employee_role)) byRole.set(e.employee_role, []);
    byRole.get(e.employee_role).push(e);
  });
  const pointers = new Map();
  return {
    assign(role) {
      const pool = byRole.get(role);
      if (!pool || !pool.length) return null;
      const idx = (pointers.get(role) || 0) % pool.length;
      pointers.set(role, idx + 1);
      return pool[idx];
    },
    poolSize(role) {
      return (byRole.get(role) || []).length;
    },
  };
}

/**
 * Строит итоговый план запуска (Milestone 10) для набора заявок: тип проекта, компания,
 * список задач по шаблону с назначенным исполнителем на каждую, готовность к запуску.
 *
 * @param {Array} applications - строки мок-таблицы ПОСЛЕ window.LPC.validateAll (нужны
 *   row._classifyResult/_matchedCompanyId/_validationOk/_validationIssues).
 * @param {Array} templates - window.MVP_TEMPLATES.
 * @param {Array} companies - справочник с `.id` (см. window.LPC.getCompanies()).
 * @param {Array} employees - справочник с `.id` (см. window.LPC.getEmployees()).
 */
function buildLaunchPlan(applications, templates, companies, employees) {
  const companiesById = new Map((companies || []).map((c) => [c.id, c]));
  const assigner = createRoundRobinAssigner(employees);
  const taskPlanCache = new Map();

  const apps = applications.map((row) => {
    const cr = row._classifyResult || null;
    // suggestedType — подтверждённый автоклассификацией (см. engine.js#classifyApplications,
    // здесь этот порог структурно недостижим — см. engine.js шапку); bestType — лучший
    // кандидат независимо от порога, но план строим только если он хотя бы дотягивает до
    // "ручного" порога 0.3 (тот же, что и classifyManualLow) — иначе это не кандидат, а шум,
    // и план задач по нему был бы гаданием, а не превью.
    const type = cr ? (cr.suggestedType || (cr.bestScore >= 0.3 ? cr.bestType : null)) : null;
    const typeConfirmed = Boolean(cr && cr.suggestedType);
    const company = row._matchedCompanyId ? companiesById.get(row._matchedCompanyId) : null;

    let tasks = [];
    if (type) {
      if (!taskPlanCache.has(type)) taskPlanCache.set(type, buildTaskPlan(type, templates));
      tasks = taskPlanCache.get(type).map((t) => ({ ...t, assignee: assigner.assign(t.requiredRole) }));
    }

    return {
      rowId: row.row_id,
      applicationId: row.application_id,
      projectName: row.project_name,
      company,
      type,
      typeConfirmed,
      typeConfidence: cr ? cr.bestScore : 0,
      tasks,
      tasksAssigned: tasks.filter((t) => t.assignee).length,
      ready: Boolean(row._validationOk),
      blockingIssues: (row._validationIssues || []).filter((i) => i.type === 'error').map((i) => i.msg),
    };
  });

  return {
    apps,
    total: apps.length,
    readyCount: apps.filter((a) => a.ready).length,
    withPlanCount: apps.filter((a) => a.tasks.length > 0).length,
    totalTasks: apps.reduce((a, p) => a + p.tasks.length, 0),
    totalAssigned: apps.reduce((a, p) => a + p.tasksAssigned, 0),
  };
}

window.CopilotLaunch = {
  buildTaskPlan,
  createRoundRobinAssigner,
  buildLaunchPlan,
};
