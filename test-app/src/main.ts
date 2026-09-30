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
  const words = normalize(question).split(' ').filter((word) => word.length > 2)
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

  const results = employees
    .map((employee) => {
      let score = 0
      const reasons: string[] = []
      let strongMatchCount = 0

      queryWords.forEach((keyword) => {
        const matchingSkill = employee.skills.find((skill) => normalize(skill).includes(keyword))
        if (matchingSkill) {
          score += 12
          strongMatchCount += 1
          reasons.push(`matches ${matchingSkill} expertise`)
        }

        const matchingProject = employee.projects
          .map((projectId) => projectMap.get(projectId))
          .find((project) => project && project.keywords.some((item) => normalize(item).includes(keyword)))
        if (matchingProject) {
          score += 14
          strongMatchCount += 1
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
          reasons.push(`documented in ${matchingDocument.title}`)
        }
      })

      const directFocusMatch = employee.currentFocus &&
        queryWords.some((keyword) => normalize(employee.currentFocus).includes(keyword))
      if (directFocusMatch) {
        score += 18
        reasons.push('current focus aligns with the question')
      }

      const projectCount = employee.projects.filter((projectId) => {
        const project = projectMap.get(projectId)
        return project?.keywords.some((item) => queryWords.some((word) => normalize(item).includes(word)))
      }).length
      if (projectCount > 0) {
        score += projectCount * 8
      }

      const uniqueReasons = Array.from(new Set(reasons)).slice(0, 3)
      const confidence = Math.min(98, Math.max(72, Math.round(score * 2.7)))

      return {
        employee,
        score,
        confidence,
        reasons: uniqueReasons.length > 0 ? uniqueReasons : ['Strong internal knowledge base'],
        strongMatchCount,
      }
    })
    .filter((result) => result.score >= 28 && result.strongMatchCount >= 1)
    .sort((left, right) => right.score - left.score)

  return results
}

function buildGraphMarkup(experts: ExpertResult[]): string {
  const positions = [
    { x: 120, y: 80 },
    { x: 250, y: 120 },
    { x: 390, y: 80 },
    { x: 180, y: 240 },
    { x: 350, y: 240 }
  ]

  const projectNodes = [
    { x: 440, y: 110, label: 'Payroll' },
    { x: 440, y: 200, label: 'Compliance' },
    { x: 440, y: 290, label: 'Belgium' }
  ]

  const connections = experts
    .map((_expert, index) => {
      const start = positions[index] ?? positions[0]
      const end = projectNodes[index % projectNodes.length]
      return `<line x1="${start.x}" y1="${start.y}" x2="${end.x - 20}" y2="${end.y}" class="graph-line" />`
    })
    .join('')

  const expertNodes = experts
    .map((expert, index) => {
      const point = positions[index] ?? positions[0]
      const ringClass = index === 0 ? 'graph-node graph-node--primary' : 'graph-node'
      return `
        <g>
          <circle cx="${point.x}" cy="${point.y}" r="28" class="${ringClass}" />
          <text x="${point.x}" y="${point.y + 5}" class="graph-label">${escapeHtml(expert.employee.name.split(' ')[0])}</text>
        </g>
      `
    })
    .join('')

  const projectLabels = projectNodes
    .map(
      (node) => `
        <g>
          <circle cx="${node.x}" cy="${node.y}" r="22" class="graph-node graph-node--project" />
          <text x="${node.x}" y="${node.y + 4}" class="graph-project-label">${escapeHtml(node.label)}</text>
        </g>
      `
    )
    .join('')

  return `
    <svg viewBox="0 0 520 360" aria-label="Expertise network graph" role="img">
      ${connections}
      ${projectLabels}
      ${expertNodes}
    </svg>
  `
}

function renderExpertList(experts: ExpertResult[]) {
  const list = document.querySelector<HTMLUListElement>('#expert-list')
  if (!list) return

  list.innerHTML = experts
    .slice(0, 5)
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

  const messageBlock = document.createElement('div')
  messageBlock.className = 'chat-thread'
  messageBlock.innerHTML = `
    <div class="message user">${escapeHtml(question)}</div>
    <div class="message bot result-box">
      <p class="result-label">Recommended Expert</p>
      <h2 class="typed-heading"></h2>
      <p class="result-body typed-role"></p>
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

function renderInsights(experts: ExpertResult[]) {
  const graphWrap = document.querySelector<HTMLDivElement>('#graph-wrap')
  if (graphWrap) {
    graphWrap.innerHTML = buildGraphMarkup(experts)
  }

  const count = document.querySelector<HTMLSpanElement>('#result-count')
  if (count) {
    count.textContent = `${experts.length} match${experts.length > 1 ? 'es' : ''}`
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
      </aside>

      <main class="insights-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Knowledge map</p>
            <h1>Expert network</h1>
          </div>
          <span class="live-pill">Live</span>
        </div>

        <div id="graph-wrap" class="graph-wrap"></div>

        <div class="experts-panel">
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

      renderInsights([])
    } else {
      renderChat(question, experts)
      renderInsights(experts)
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
