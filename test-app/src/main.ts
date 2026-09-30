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

function keywordsMatch(left: string, right: string): boolean {
  const normalizedLeft = normalize(left)
  const normalizedRight = normalize(right)
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true
  return (normalizedLeft === 'belgian' && normalizedRight === 'belgium') ||
    (normalizedLeft === 'belgium' && normalizedRight === 'belgian')
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

function getActivityRecency(activity: string): { score: number | null; label: string } {
  const exactMatch = activity.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i)
  const recentMatch = activity.match(/last\s+(\d+)\s+(day|week|month|year)s?/i)
  const match = exactMatch ?? recentMatch
  if (!match) return { score: null, label: 'Activity timing unavailable' }

  const amount = Number(match[1])
  const unit = match[2].toLowerCase()
  const dayMultipliers: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 }
  const days = amount * dayMultipliers[unit]
  const score = Math.round(100 * Math.pow(0.5, days / 180))
  const label = exactMatch
    ? `${amount} ${unit}${amount === 1 ? '' : 's'} ago`
    : `Within ${amount} ${unit}${amount === 1 ? '' : 's'}`

  return { score, label }
}

function splitSvgLabel(value: string, maxLength = 18): [string, string] {
  const words = value.split(/\s+/)
  let firstLine = ''
  let secondLine = ''

  words.forEach((word) => {
    if (!secondLine && `${firstLine} ${word}`.trim().length <= maxLength) {
      firstLine = `${firstLine} ${word}`.trim()
    } else {
      secondLine = `${secondLine} ${word}`.trim()
    }
  })

  return [firstLine, secondLine]
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
  const graphEntries = visibleExperts
    .map((expert, rank) => {
      const employeeProjects = projects.filter((project) => expert.employee.projects.includes(project.id))
      const project = employeeProjects
        .map((item) => ({
          item,
          relevance: item.keywords.filter((keyword) =>
            queryWords.some((word) => keywordsMatch(keyword, word))
          ).length
        }))
        .sort((left, right) => right.relevance - left.relevance)[0]?.item
      const matchingTerms = project?.keywords.filter((keyword) =>
        queryWords.some((word) => keywordsMatch(keyword, word))
      ) ?? []
      const topic = queryWords
        .filter((word) => matchingTerms.some((term) => keywordsMatch(term, word)))
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

      return {
        expert,
        rank,
        project,
        topic: topic || project?.domain || 'Expertise',
        activity: getActivityRecency(expert.employee.activity)
      }
    })
    .filter((entry) => entry.project)
    .sort((left, right) => left.expert.employee.department.localeCompare(right.expert.employee.department) || left.rank - right.rank)
    .map((entry, index) => ({ ...entry, y: 62 + index * 84 }))

  const departmentGroups = new Map<string, typeof graphEntries>()
  graphEntries.forEach((entry) => {
    const department = entry.expert.employee.department
    const group = departmentGroups.get(department) ?? []
    group.push(entry)
    departmentGroups.set(department, group)
  })

  const teamClusters = Array.from(departmentGroups.entries()).map(([department, members]) => {
    const firstY = members[0].y
    const lastY = members[members.length - 1].y
    return `
      <rect x="347" y="${firstY - 25}" width="166" height="${lastY - firstY + 50}" rx="12" class="graph-team-cluster" />
      <text x="354" y="${firstY - 29}" class="graph-team-label">${escapeHtml(department)}</text>
    `
  }).join('')

  const topicNodes = new Map<string, { key: string; label: string; y: number }>()
  graphEntries.forEach((entry) => {
    const key = normalize(entry.topic)
    if (!topicNodes.has(key)) topicNodes.set(key, { key, label: entry.topic, y: 0 })
  })
  Array.from(topicNodes.values()).forEach((node) => {
    const linkedEntries = graphEntries.filter((entry) => normalize(entry.topic) === node.key)
    node.y = linkedEntries.reduce((total, entry) => total + entry.y, 0) / linkedEntries.length
  })

  const projectNodes = new Map<string, { project: Project; y: number }>()
  graphEntries.forEach((entry) => {
    if (entry.project && !projectNodes.has(entry.project.id)) {
      projectNodes.set(entry.project.id, { project: entry.project, y: 0 })
    }
  })
  Array.from(projectNodes.values()).forEach((node) => {
    const linkedEntries = graphEntries.filter((entry) => entry.project?.id === node.project.id)
    node.y = linkedEntries.reduce((total, entry) => total + entry.y, 0) / linkedEntries.length
  })

  const dashPatterns = ['none', '12 6', '7 6']
  const dashStyle = (rank: number) => `stroke-dasharray:${dashPatterns[rank] ?? dashPatterns[dashPatterns.length - 1]}`
  const topicProjectEdges = new Map<string, { topic: { key: string; label: string; y: number }; project: { project: Project; y: number }; rank: number }>()
  graphEntries.forEach((entry) => {
    if (!entry.project) return
    const topic = topicNodes.get(normalize(entry.topic))
    const project = projectNodes.get(entry.project.id)
    if (!topic || !project) return

    const key = `${topic.key}:${project.project.id}`
    const existing = topicProjectEdges.get(key)
    if (!existing || entry.rank < existing.rank) {
      topicProjectEdges.set(key, { topic, project, rank: entry.rank })
    }
  })

  const connections = [
    ...Array.from(topicProjectEdges.values()).map(({ topic, project, rank }) =>
      `<path d="M 145 ${topic.y} C 152 ${topic.y}, 156 ${project.y}, 163 ${project.y}" class="graph-line" style="${dashStyle(rank)}" />`
    ),
    ...graphEntries.flatMap((entry) => {
      if (!entry.project) return []
      const project = projectNodes.get(entry.project.id)
      if (!project) return []
      return [`<path d="M 328 ${project.y} C 336 ${project.y}, 339 ${entry.y}, 347 ${entry.y}" class="graph-line" style="${dashStyle(entry.rank)}" />`]
    })
  ].join('')

  const topicLabelsSvg = Array.from(topicNodes.values()).map((node) => `
    <g>
      <rect x="8" y="${node.y - 19}" width="137" height="38" rx="12" class="graph-topic-node" />
      <text x="76" y="${node.y + 4}" class="graph-topic-label">${escapeHtml(node.label)}</text>
    </g>
  `).join('')

  const projectLabelsSvg = Array.from(projectNodes.values()).map(({ project, y }) => {
    const [projectLine1, projectLine2] = splitSvgLabel(project.name)
    return `
      <g>
        <rect x="163" y="${y - 21}" width="165" height="42" rx="12" class="graph-project-node" />
        <text x="245" y="${y - (projectLine2 ? 2 : -4)}" class="graph-project-label">${escapeHtml(projectLine1)}</text>
        ${projectLine2 ? `<text x="245" y="${y + 11}" class="graph-project-label graph-project-label--secondary">${escapeHtml(projectLine2)}</text>` : ''}
      </g>
    `
  }).join('')

  const personNodesSvg = graphEntries.map((entry, index) => {
    const confidenceClass = entry.expert.confidence >= 80
      ? 'graph-confidence-high'
      : entry.expert.confidence >= 65
        ? 'graph-confidence-medium'
        : 'graph-confidence-low'
    const radius = 16 + entry.expert.confidence * 0.07
    const recencyText = entry.activity.score === null
      ? 'Recency unavailable'
      : `Recency ${entry.activity.score}`

    return `
      <g>
        <defs>
          <clipPath id="employee-photo-${index}">
            <circle cx="366" cy="${entry.y}" r="${(radius - 1.5).toFixed(1)}" />
          </clipPath>
        </defs>
        <image
          href="/standard_pfp.png"
          x="${(366 - radius + 1.5).toFixed(1)}"
          y="${(entry.y - radius + 1.5).toFixed(1)}"
          width="${((radius - 1.5) * 2).toFixed(1)}"
          height="${((radius - 1.5) * 2).toFixed(1)}"
          preserveAspectRatio="xMidYMid slice"
          clip-path="url(#employee-photo-${index})"
          aria-label="Profile photo for ${escapeHtml(entry.expert.employee.name)}"
        />
        <circle cx="366" cy="${entry.y}" r="${radius.toFixed(1)}" class="graph-person-node ${confidenceClass}" />
        <text x="391" y="${entry.y - 7}" class="graph-person-name">${escapeHtml(entry.expert.employee.name.split(' ')[0])}</text>
        <text x="391" y="${entry.y + 6}" class="graph-person-meta">${entry.expert.confidence}% confidence · ${recencyText}</text>
        <text x="391" y="${entry.y + 18}" class="graph-person-activity">Last activity: ${escapeHtml(entry.activity.label)}</text>
      </g>
    `
  }).join('')

  return `
    <svg viewBox="0 0 520 280" aria-label="Knowledge paths showing topic, project, expert, confidence, recency, and team" role="img">
      <text x="12" y="16" class="graph-column-label">TOPIC</text>
      <text x="168" y="16" class="graph-column-label">PROJECT</text>
      <text x="352" y="16" class="graph-column-label">TEAM</text>
      ${teamClusters}
      ${connections}
      ${topicLabelsSvg}
      ${projectLabelsSvg}
      ${personNodesSvg}
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

function updateSuggestedQuestions(
  question: string,
  experts: ExpertResult[],
  projects: Project[]
): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.prompt')
  const queryWords = extractKeywords(question)
  const suggestions: Array<{ label: string; question: string }> = []
  const seenQuestions = new Set<string>()

  const addSuggestion = (label: string, suggestedQuestion: string) => {
    const key = normalize(suggestedQuestion)
    if (suggestions.length >= buttons.length || seenQuestions.has(key)) return
    seenQuestions.add(key)
    suggestions.push({ label, question: suggestedQuestion })
  }

  const relatedProjects = projects
    .map((project) => {
      const keywordMatches = project.keywords.filter((keyword) =>
        queryWords.some((word) => keywordsMatch(keyword, word))
      ).length
      const expertMatches = experts.filter((expert) => expert.employee.projects.includes(project.id)).length
      return { project, keywordMatches, expertMatches }
    })
    .filter((item) => item.keywordMatches > 0 || item.expertMatches > 0)
    .sort((left, right) =>
      right.keywordMatches - left.keywordMatches || right.expertMatches - left.expertMatches
    )

  relatedProjects.forEach(({ project }) => {
    addSuggestion(project.name, `Who has worked on ${project.name}?`)
    const additionalKeyword = project.keywords.find((keyword) =>
      !queryWords.some((word) => keywordsMatch(keyword, word))
    )
    if (additionalKeyword) {
      const label = `${additionalKeyword.charAt(0).toUpperCase()}${additionalKeyword.slice(1)} expertise`
      addSuggestion(label, `Who can help with ${additionalKeyword} for ${project.domain}?`)
    }
  })

  experts.slice(0, 3).forEach((expert) => {
    expert.employee.skills.forEach((skill) => {
      if (queryWords.some((word) => keywordsMatch(skill, word))) return
      addSuggestion(`${skill} expertise`, `Who else has experience with ${skill}?`)
    })
  })

  const topic = queryWords.slice(0, 3).join(' ') || 'this topic'
  addSuggestion(`Projects about ${topic}`, `What projects involve ${topic}?`)
  addSuggestion(`More on ${topic}`, `Who else has experience with ${topic}?`)
  addSuggestion(`Documents about ${topic}`, `Which documents cover ${topic}?`)

  buttons.forEach((button, index) => {
    const suggestion = suggestions[index]
    if (!suggestion) return
    button.textContent = suggestion.label
    button.dataset.question = suggestion.question
  })
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
          <div class="brand-mark">
            <img src="/matchpoint-mark.png" alt="Matchpoint" />
          </div>
          <div>
            <p class="brand-title">Matchpoint</p>
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
    updateSuggestedQuestions(question, experts, projects)
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
  input?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    form?.requestSubmit()
  })

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
