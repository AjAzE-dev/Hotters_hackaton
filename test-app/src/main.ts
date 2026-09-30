import './style.css'

type Employee = {
  id: string
  name: string
  role: string
  department: string
  skills: string[]
  projects: string[]
  documents: string[]
  currentFocus: string
  activity: string
  manager: string | null
}

type Project = {
  id: string
  name: string
  domain: string
  keywords: string[]
  team: string[]
}

type Document = {
  id: string
  title: string
  topic: string
  keywords: string[]
  owner: string
}

type ExpertResult = {
  employee: Employee
  score: number
  confidence: number
  reasons: string[]
  strongMatchCount: number
  firstContact?: Employee | null
  relationship?: string
}

function getHierarchyScore(role: string): number {
  const value = role.toLowerCase()

  if (value.includes('vp') || value.includes('director')) return 5
  if (value.includes('lead') || value.includes('partner') || value.includes('manager')) return 4
  if (value.includes('senior')) return 3
  if (value.includes('specialist')) return 2
  return 1
}

const defaultQuestion = 'Who has the most experience with Belgian payroll compliance?'

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`)
  }
  return response.json() as Promise<T>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractKeywords(question: string): string[] {
  const ignoredWords = new Set([
    'who', 'what', 'when', 'where', 'which', 'why', 'how', 'the', 'and', 'for',
    'with', 'from', 'about', 'has', 'have', 'had', 'does', 'did', 'is', 'are',
    'was', 'were', 'most', 'best', 'experience', 'expert', 'experts', 'know',
    'knows', 'find', 'help', 'please', 'someone', 'can', 'could', 'would'
  ])
  const words = normalize(question)
    .split(' ')
    .filter((word) => word.length > 2 && !ignoredWords.has(word))
  return Array.from(new Set(words))
}

function findExperts(
  question: string,
  employees: Employee[],
  projects: Project[],
  documents: Document[]
): ExpertResult[] {
  const queryWords = extractKeywords(question)

  if (queryWords.length === 0) {
    return []
  }

  const projectMap = new Map(projects.map((project) => [project.id, project]))
  const employeeMap = new Map(employees.map((employee) => [employee.name, employee]))

  const results = employees
    .map((employee) => {
      let score = 0
      const reasons: string[] = []
      let strongMatchCount = 0
      const matchedKeywords = new Set<string>()
      const evidenceSignals = new Set<string>()
      const evidenceSources = new Set<string>()

      queryWords.forEach((keyword) => {
        const matchingSkill = employee.skills.find((skill) => normalize(skill).includes(keyword))
        if (matchingSkill) {
          score += 12
          strongMatchCount += 1
          matchedKeywords.add(keyword)
          evidenceSignals.add(`${keyword}:skill`)
          evidenceSources.add('skill')
          reasons.push(`matches ${matchingSkill} expertise`)
        }

        const matchingProject = employee.projects
          .map((projectId) => projectMap.get(projectId))
          .find((project) => project && project.keywords.some((item) => normalize(item).includes(keyword)))
        if (matchingProject) {
          score += 14
          strongMatchCount += 1
          matchedKeywords.add(keyword)
          evidenceSignals.add(`${keyword}:project`)
          evidenceSources.add('project')
          reasons.push(`worked on ${matchingProject.name}`)
        }

        const matchingDocument = documents.find(
          (document) =>
            document.owner === employee.name &&
            document.keywords.some((item) => normalize(item).includes(keyword))
        )
        if (matchingDocument) {
          score += 10
          strongMatchCount += 1
          matchedKeywords.add(keyword)
          evidenceSignals.add(`${keyword}:document`)
          evidenceSources.add('document')
          reasons.push(`documented in ${matchingDocument.title}`)
        }
      })

      const matchingFocusKeywords = queryWords.filter((keyword) =>
        normalize(employee.currentFocus).includes(keyword)
      )
      if (matchingFocusKeywords.length > 0) {
        score += 18
        matchingFocusKeywords.forEach((keyword) => {
          matchedKeywords.add(keyword)
          evidenceSignals.add(`${keyword}:focus`)
        })
        evidenceSources.add('focus')
        reasons.push('current focus aligns with the question')
      }

      const projectCount = employee.projects.filter((projectId) => {
        const project = projectMap.get(projectId)
        return project?.keywords.some((item) => queryWords.some((word) => normalize(item).includes(word)))
      }).length
      if (projectCount > 0) {
        score += projectCount * 8
      }

      const managerMatch = employee.manager && employeeMap.get(employee.manager)
      if (managerMatch) {
        score += 5
      }

      const uniqueReasons = Array.from(new Set(reasons)).slice(0, 3)
      const queryCoverage = matchedKeywords.size / queryWords.length
      const evidenceStrength = 50 + Math.round(queryCoverage * 30) +
        Math.min(evidenceSignals.size, 8) * 1.5 + evidenceSources.size * 2
      const confidence = Math.min(94, Math.max(55, Math.round(evidenceStrength)))

      return {
        employee,
        score,
        confidence,
        reasons: uniqueReasons.length > 0 ? uniqueReasons : ['Strong internal knowledge base'],
        strongMatchCount,
      }
    })
    .filter((result) => result.score >= 28 && result.strongMatchCount >= 1)
    .map((result) => {
      const guidance = getBestFirstContact(result.employee, employees)

      return {
        ...result,
        firstContact: guidance.firstContact,
        relationship: guidance.relationship,
      }
    })
    .sort((left, right) => right.confidence - left.confidence || right.score - left.score)

  return results
}

function getBestFirstContact(employee: Employee, employees: Employee[]): {
  firstContact: Employee | null
  relationship: string
} {
  const manager = employee.manager ? employees.find((person) => person.name === employee.manager) ?? null : null
  if (manager) {
    return {
      firstContact: manager,
      relationship: `${employee.name} reports to ${manager.name}`,
    }
  }

  const sameManagerGroup = employees.filter(
    (person) => person.manager === employee.manager && person.name !== employee.name
  )
  if (sameManagerGroup.length > 0) {
    const seniorPeer = [...sameManagerGroup].sort(
      (a, b) => getHierarchyScore(b.role) - getHierarchyScore(a.role)
    )[0]

    return {
      firstContact: seniorPeer,
      relationship: `${employee.name} and ${seniorPeer.name} are in the same team. ${seniorPeer.name} is the more senior point of contact.`,
    }
  }

  const sameDepartment = employees.filter(
    (person) => person.department === employee.department && person.name !== employee.name
  )
  if (sameDepartment.length > 0) {
    const seniorPeer = [...sameDepartment].sort(
      (a, b) => getHierarchyScore(b.role) - getHierarchyScore(a.role)
    )[0]

    return {
      firstContact: seniorPeer,
      relationship: `${employee.name} and ${seniorPeer.name} work in the same department. ${seniorPeer.name} is the best first contact.`,
    }
  }

  return {
    firstContact: null,
    relationship: 'Independent specialist',
  }
}

function buildGraphMarkup(experts: ExpertResult[], projects: Project[], question = ''): string {
  const visibleExperts = experts.slice(0, 3)
  const queryWords = extractKeywords(question)
  const relevantProjects = projects
    .filter((project) => visibleExperts.some((expert) => expert.employee.projects.includes(project.id)))
    .map((project) => {
      const supportingExperts = visibleExperts.filter((expert) =>
        expert.employee.projects.includes(project.id)
      )
      const keywordMatches = project.keywords.filter((keyword) =>
        queryWords.some((word) => normalize(keyword).includes(word) || word.includes(normalize(keyword)))
      ).length

      return { project, supportingExperts, score: supportingExperts.length * 3 + keywordMatches }
    })

  const topicScores = new Map<string, number>()
  relevantProjects.forEach(({ project, score }) => {
    topicScores.set(project.domain, (topicScores.get(project.domain) ?? 0) + score)
  })
  const topicLabels = [...topicScores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([label]) => label)
  const graphExperts = visibleExperts
    .map((expert, originalIndex) => ({
      expert,
      originalIndex,
      targetIndex: topicLabels.findIndex((label) =>
        relevantProjects.some(({ project, supportingExperts }) =>
          project.domain === label && supportingExperts.some((supporter) =>
            supporter.employee.name === expert.employee.name
          )
        )
      )
    }))
    .sort((left, right) => {
      const leftTarget = left.targetIndex < 0 ? Number.MAX_SAFE_INTEGER : left.targetIndex
      const rightTarget = right.targetIndex < 0 ? Number.MAX_SAFE_INTEGER : right.targetIndex
      return leftTarget - rightTarget || left.originalIndex - right.originalIndex
    })

  const connectedTopicIndexes = topicLabels
    .map((_, index) => index)
    .filter((topicIndex) => graphExperts.some((expert) => expert.targetIndex === topicIndex))
  const projectNodes = connectedTopicIndexes.map((topicIndex, index) => ({
    topicIndex,
    x: 430,
    y: connectedTopicIndexes.length === 1 ? 180 : 48 + (index * 264) / (connectedTopicIndexes.length - 1),
    label: topicLabels[topicIndex]
  }))

  const graphTop = 48
  const graphBottom = 312
  const expertPositions = graphExperts.map((_, index) => ({
    x: 112,
    y: graphExperts.length === 1
      ? (graphTop + graphBottom) / 2
      : graphTop + (index * (graphBottom - graphTop)) / (graphExperts.length - 1)
  }))

  const dashPatterns = ['none', '12 6', '7 6', '4 6', '1 5']
  const connections = graphExperts
    .map(({ originalIndex, targetIndex }, index) => {
      if (targetIndex < 0) return ''
      const start = expertPositions[index]
      const end = projectNodes.find((node) => node.topicIndex === targetIndex)
      if (!end) return ''
      const path = `M ${start.x + 29} ${start.y} C 220 ${start.y}, 320 ${end.y}, ${end.x - 25} ${end.y}`
      const dashPattern = dashPatterns[originalIndex] ?? dashPatterns[dashPatterns.length - 1]
      return `<path d="${path}" class="graph-line" style="stroke-dasharray:${dashPattern}" />`
    })
    .join('')

  const expertNodes = graphExperts
    .map(({ expert, originalIndex }, index) => {
      const point = expertPositions[index]
      const ringClass = originalIndex === 0 ? 'graph-node graph-node--primary' : 'graph-node'
      return `
        <g>
          <circle cx="${point.x}" cy="${point.y}" r="28" class="${ringClass}" />
          <text x="${point.x}" y="${point.y + 5}" class="graph-label">${escapeHtml(expert.employee.name.split(' ')[0])}</text>
        </g>
      `
    })
    .join('')

  const projectLabelsSvg = projectNodes
    .map(
      (node) => `
        <g>
          <circle cx="${node.x}" cy="${node.y}" r="24" class="graph-node graph-node--project" />
          <text x="${node.x}" y="${node.y + 4}" class="graph-project-label">${escapeHtml(node.label)}</text>
        </g>
      `
    )
    .join('')

  return `
    <svg viewBox="0 0 520 360" aria-label="Expertise network graph" role="img">
      ${connections}
      ${projectLabelsSvg}
      ${expertNodes}
    </svg>
  `
}

function renderExpertList(experts: ExpertResult[]) {
  const list = document.querySelector<HTMLUListElement>('#expert-list')
  if (!list) return

  list.innerHTML = experts
    .slice(0, 3)
    .map(
      (result, index) => `
        <li class="person-card ${index === 0 ? 'is-highlighted' : ''}">
          <div class="person-header">
            <div>
              <p class="rank">#${index + 1}</p>
              <h3>${escapeHtml(result.employee.name)}</h3>
            </div>
            <span class="confidence">${result.confidence}%</span>
          </div>
          <p class="role">${escapeHtml(result.employee.role)}</p>
          <div class="pill-row">
            ${result.employee.skills.slice(0, 3).map((skill) => `<span class="pill">${escapeHtml(skill)}</span>`).join('')}
          </div>
          <ul class="reason-list">
            ${result.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}
          </ul>
        </li>
      `
    )
    .join('')
}

function typeIntoElement(element: HTMLElement | null, text: string, speed = 20): void {
  if (!element) return

  element.textContent = ''
  let index = 0

  const interval = window.setInterval(() => {
    element.textContent = text.slice(0, index + 1)
    index += 1

    if (index >= text.length) {
      window.clearInterval(interval)
    }
  }, speed)
}

function renderGreeting(): void {
  const history = document.querySelector<HTMLDivElement>('#chat-history')
  if (!history) return

  history.innerHTML = ''
  const greeting = document.createElement('div')
  greeting.className = 'message bot greeting-message'
  greeting.textContent = 'Hello! I can help you find the right expert for your question.'
  history.appendChild(greeting)
}

function renderChat(question: string, experts: ExpertResult[]) {
  const top = experts[0]
  const history = document.querySelector<HTMLDivElement>('#chat-history')
  if (!history || !top) return

  const firstContactText = top.firstContact
    ? `Best first contact: ${top.firstContact.name} — ${top.relationship}`
    : 'Best first contact: this expert is the most direct match'

  const messageBlock = document.createElement('div')
  messageBlock.className = 'chat-thread'
  messageBlock.innerHTML = `
    <div class="message user">${escapeHtml(question)}</div>
    <div class="message bot result-box">
      <p class="result-label">Recommended Expert</p>
      <h2 class="typed-heading"></h2>
      <p class="result-body typed-role"></p>
      <p class="result-note">${escapeHtml(firstContactText)}</p>
      <ul class="typed-reasons">
        ${top.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}
      </ul>
    </div>
  `

  history.appendChild(messageBlock)

  const heading = messageBlock.querySelector<HTMLElement>('.typed-heading')
  const role = messageBlock.querySelector<HTMLElement>('.typed-role')
  const reasons = messageBlock.querySelectorAll<HTMLLIElement>('.typed-reasons li')

  if (heading) {
    typeIntoElement(heading, `${top.employee.name} (${top.confidence}% confidence)`)
  }

  if (role) {
    typeIntoElement(role, `${top.employee.role} • ${top.employee.department}`)
  }

  reasons.forEach((item, index) => {
    item.style.animationDelay = `${index * 120}ms`
  })
}

function renderInsights(experts: ExpertResult[], projects: Project[], question = '') {
  const graphWrap = document.querySelector<HTMLDivElement>('#graph-wrap')
  if (graphWrap) {
    graphWrap.innerHTML = buildGraphMarkup(experts, projects, question)
  }

  const count = document.querySelector<HTMLSpanElement>('#result-count')
  if (count) {
    count.textContent = experts.length > 3
      ? `Top 3 of ${experts.length} matches`
      : `${experts.length} match${experts.length === 1 ? '' : 'es'}`
  }

  renderExpertList(experts)
}

async function initDashboard() {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) return

  const [employees, projects, documents] = await Promise.all([
    fetchJson<Employee[]>('/data/employees.json'),
    fetchJson<Project[]>('/data/projects.json'),
    fetchJson<Document[]>('/data/documents.json')
  ])

  app.innerHTML = `
    <div class="dashboard-shell">
      <aside class="chat-panel">
        <div class="brand-row">
          <div class="brand-mark">C</div>
          <div>
            <p class="brand-title">Connect</p>
            <span>Expertise discovery</span>
          </div>
        </div>

        <div id="chat-history" class="chat-history"></div>

        <div class="quick-prompts" aria-label="Suggested questions">
          <button type="button" class="prompt" data-question="Who knows the most about Belgian payroll compliance?">Belgian payroll compliance</button>
          <button type="button" class="prompt" data-question="Who is best for SAP payroll and HR process design?">SAP payroll expertise</button>
          <button type="button" class="prompt" data-question="Who handles employment policy risk in Europe?">Employment policy risk</button>
        </div>

        <form id="chat-form" class="chat-form">
          <label class="sr-only" for="question-input">Ask a question</label>
          <textarea id="question-input" class="example-question-input" name="question" rows="1" placeholder="Ask a question...">${escapeHtml(defaultQuestion)}</textarea>
          <button type="submit">Ask</button>
        </form>

        <section class="knowledge-map" aria-labelledby="knowledge-map-title">
          <h2 id="knowledge-map-title" class="eyebrow">Knowledge map</h2>
          <div id="graph-wrap" class="graph-wrap"></div>
        </section>
      </aside>

      <main class="insights-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Expert network</p>
            <h1>Relevant Experts</h1>
          </div>
          <span class="live-pill">Live</span>
        </div>

        <div class="experts-panel experts-panel--standalone">
          <div class="section-header">
            <h2>Relevant Experts</h2>
            <span id="result-count">0 matches</span>
          </div>
          <ul id="expert-list" class="expert-list"></ul>
        </div>
      </main>
    </div>
  `

  const handleQuestion = (question: string, shouldClearInput = true) => {
    const experts = findExperts(question, employees, projects, documents)
    const history = document.querySelector<HTMLDivElement>('#chat-history')

    if (experts.length === 0) {
      const fallbackMessage = `I’m not confident enough to recommend a specific expert for that question based on the available data. Try asking about something more specific like payroll, compliance, SAP, or Belgium.`

      if (history) {
        const messageBlock = document.createElement('div')
        messageBlock.className = 'chat-thread'
        messageBlock.innerHTML = `
          <div class="message user">${escapeHtml(question)}</div>
          <div class="message bot result-box">
            <p class="result-label">Not enough evidence</p>
            <p class="result-body">${escapeHtml(fallbackMessage)}</p>
          </div>
        `
        history.appendChild(messageBlock)
        window.setTimeout(() => {
          history.scrollTo({ top: history.scrollHeight, behavior: 'smooth' })
        }, 50)
      }

      renderInsights([], projects, question)
    } else {
      renderChat(question, experts)
      renderInsights(experts, projects, question)
      if (history) {
        window.setTimeout(() => {
          history.scrollTo({ top: history.scrollHeight, behavior: 'smooth' })
        }, 150)
      }
    }

    if (shouldClearInput && input) {
      input.value = ''
      input.style.height = '48px'
    }
  }

  const form = document.querySelector<HTMLFormElement>('#chat-form')
  const input = document.querySelector<HTMLTextAreaElement>('#question-input')
  const promptButtons = document.querySelectorAll<HTMLButtonElement>('.prompt')

  const autoResizeTextarea = () => {
    if (!input) return

    input.style.height = 'auto'
    const maxHeight = 156
    const nextHeight = Math.min(input.scrollHeight, maxHeight)
    input.style.height = `${nextHeight}px`
  }

  input?.addEventListener('input', autoResizeTextarea)

  promptButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const question = button.dataset.question ?? defaultQuestion
      if (input) {
        input.value = question
        autoResizeTextarea()
      }
      handleQuestion(question, true)
    })
  })

  form?.addEventListener('submit', (event) => {
    event.preventDefault()
    const question = input?.value?.trim()
    if (!question) return
    handleQuestion(question, true)
  })

  autoResizeTextarea()
  renderGreeting()
}

initDashboard().catch((error) => {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (app) {
    app.innerHTML = `<div class="error-state">Unable to load expertise data: ${escapeHtml(String(error))}</div>`
  }
})
