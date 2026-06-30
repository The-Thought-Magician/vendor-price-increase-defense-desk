// Same-origin relative calls to /api/proxy/<path>. The proxy route injects X-User-Id
// after resolving the Neon Auth session, then forwards to the backend at /api/v1/<path>.

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`/api/proxy/${path}`, init)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new Error(message)
  }
  return data
}

const get = (path: string) => req(path)
const post = (path: string, body?: unknown) =>
  req(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
const put = (path: string, body?: unknown) =>
  req(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
const del = (path: string) => req(path, { method: 'DELETE' })

function qs(params?: Record<string, unknown>): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

const api = {
  // Workspaces
  getWorkspace: () => get('workspaces/current'),
  listWorkspaces: () => get('workspaces'),
  createWorkspace: (body: unknown) => post('workspaces', body),
  updateWorkspace: (id: string, body: unknown) => put(`workspaces/${id}`, body),

  // Categories
  getCategories: () => get('categories'),
  getCategory: (id: string) => get(`categories/${id}`),
  createCategory: (body: unknown) => post('categories', body),
  updateCategory: (id: string, body: unknown) => put(`categories/${id}`, body),
  deleteCategory: (id: string) => del(`categories/${id}`),

  // Suppliers
  getSuppliers: () => get('suppliers'),
  getSupplier: (id: string) => get(`suppliers/${id}`),
  getSupplierScorecard: (id: string) => get(`suppliers/${id}/scorecard`),
  getSupplierLetters: (id: string) => get(`suppliers/${id}/letters`),
  createSupplier: (body: unknown) => post('suppliers', body),
  updateSupplier: (id: string, body: unknown) => put(`suppliers/${id}`, body),
  deleteSupplier: (id: string) => del(`suppliers/${id}`),

  // Contracts
  getContracts: () => get('contracts'),
  getContract: (id: string) => get(`contracts/${id}`),
  createContract: (body: unknown) => post('contracts', body),
  updateContract: (id: string, body: unknown) => put(`contracts/${id}`, body),
  deleteContract: (id: string) => del(`contracts/${id}`),

  // Clauses
  getClauses: (contractId: string) => get(`clauses${qs({ contract_id: contractId })}`),
  getClause: (id: string) => get(`clauses/${id}`),
  createClause: (body: unknown) => post('clauses', body),
  updateClause: (id: string, body: unknown) => put(`clauses/${id}`, body),
  deleteClause: (id: string) => del(`clauses/${id}`),

  // Indices
  getIndices: () => get('indices'),
  getIndex: (id: string) => get(`indices/${id}`),
  createIndex: (body: unknown) => post('indices', body),
  updateIndex: (id: string, body: unknown) => put(`indices/${id}`, body),
  deleteIndex: (id: string) => del(`indices/${id}`),

  // Index data
  getIndexData: (indexId: string) => get(`index-data${qs({ index_id: indexId })}`),
  addIndexData: (body: unknown) => post('index-data', body),
  importIndexData: (body: unknown) => post('index-data/import', body),
  deleteIndexData: (id: string) => del(`index-data/${id}`),

  // Letters
  getLetters: (params?: Record<string, unknown>) => get(`letters${qs(params)}`),
  getLetter: (id: string) => get(`letters/${id}`),
  createLetter: (body: unknown) => post('letters', body),
  updateLetter: (id: string, body: unknown) => put(`letters/${id}`, body),
  setLetterStatus: (id: string, status: string) => post(`letters/${id}/status`, { status }),
  deleteLetter: (id: string) => del(`letters/${id}`),
  getLineItems: (id: string) => get(`letters/${id}/line-items`),
  addLineItem: (id: string, body: unknown) => post(`letters/${id}/line-items`, body),
  deleteLineItem: (id: string, itemId: string) => del(`letters/${id}/line-items/${itemId}`),

  // Clause checks
  getClauseChecks: (letterId: string) => get(`clause-checks${qs({ letter_id: letterId })}`),
  runClauseChecks: (letterId: string) => post('clause-checks/run', { letter_id: letterId }),

  // Index validations
  getIndexValidations: (letterId: string) => get(`index-validations${qs({ letter_id: letterId })}`),
  runIndexValidation: (body: unknown) => post('index-validations/run', body),

  // Creep
  getCreep: (contractId: string) => get(`creep${qs({ contract_id: contractId })}`),
  computeCreep: (contractId: string) => post('creep/compute', { contract_id: contractId }),

  // Packets
  getPackets: (letterId?: string) => get(`packets${qs({ letter_id: letterId })}`),
  getPacket: (id: string) => get(`packets/${id}`),
  generatePacket: (body: unknown) => post('packets/generate', body),
  createPacket: (body: unknown) => post('packets', body),
  updatePacket: (id: string, body: unknown) => put(`packets/${id}`, body),
  addPacketSection: (id: string, body: unknown) => post(`packets/${id}/sections`, body),
  updatePacketSection: (id: string, sectionId: string, body: unknown) => put(`packets/${id}/sections/${sectionId}`, body),
  deletePacketSection: (id: string, sectionId: string) => del(`packets/${id}/sections/${sectionId}`),
  deletePacket: (id: string) => del(`packets/${id}`),

  // Templates
  getTemplates: (breachType?: string) => get(`templates${qs({ breach_type: breachType })}`),
  getTemplate: (id: string) => get(`templates/${id}`),
  createTemplate: (body: unknown) => post('templates', body),
  updateTemplate: (id: string, body: unknown) => put(`templates/${id}`, body),
  deleteTemplate: (id: string) => del(`templates/${id}`),

  // Approvals
  getApprovals: (params?: Record<string, unknown>) => get(`approvals${qs(params)}`),
  getApproval: (id: string) => get(`approvals/${id}`),
  createApproval: (body: unknown) => post('approvals', body),
  decideApproval: (id: string, body: unknown) => post(`approvals/${id}/decide`, body),
  deleteApproval: (id: string) => del(`approvals/${id}`),

  // Audit
  getAudit: (params?: Record<string, unknown>) => get(`audit${qs(params)}`),
  recordAudit: (body: unknown) => post('audit', body),

  // Comments
  getComments: (letterId: string) => get(`comments${qs({ letter_id: letterId })}`),
  addComment: (body: unknown) => post('comments', body),
  deleteComment: (id: string) => del(`comments/${id}`),

  // Baselines
  getBaselines: (supplierId?: string) => get(`baselines${qs({ supplier_id: supplierId })}`),
  createBaseline: (body: unknown) => post('baselines', body),
  updateBaseline: (id: string, body: unknown) => put(`baselines/${id}`, body),
  deleteBaseline: (id: string) => del(`baselines/${id}`),

  // Scenarios
  getScenarios: (letterId: string) => get(`scenarios${qs({ letter_id: letterId })}`),
  modelScenarios: (letterId: string) => post('scenarios/model', { letter_id: letterId }),
  createScenario: (body: unknown) => post('scenarios', body),
  deleteScenario: (id: string) => del(`scenarios/${id}`),

  // Deadlines
  getDeadlines: (params?: Record<string, unknown>) => get(`deadlines${qs(params)}`),
  getUpcomingDeadlines: () => get('deadlines/upcoming'),
  createDeadline: (body: unknown) => post('deadlines', body),
  updateDeadline: (id: string, body: unknown) => put(`deadlines/${id}`, body),
  deleteDeadline: (id: string) => del(`deadlines/${id}`),

  // Playbooks
  getPlaybooks: () => get('playbooks'),
  getPlaybook: (id: string) => get(`playbooks/${id}`),
  createPlaybook: (body: unknown) => post('playbooks', body),
  updatePlaybook: (id: string, body: unknown) => put(`playbooks/${id}`, body),
  deletePlaybook: (id: string) => del(`playbooks/${id}`),

  // Notifications
  getNotifications: () => get('notifications'),
  markNotificationRead: (id: string) => post(`notifications/${id}/read`),
  markAllNotificationsRead: () => post('notifications/read-all'),
  deleteNotification: (id: string) => del(`notifications/${id}`),

  // Documents
  getDocuments: (params?: Record<string, unknown>) => get(`documents${qs(params)}`),
  getDocument: (id: string) => get(`documents/${id}`),
  createDocument: (body: unknown) => post('documents', body),
  updateDocument: (id: string, body: unknown) => put(`documents/${id}`, body),
  deleteDocument: (id: string) => del(`documents/${id}`),

  // Reports
  getSavingsReport: () => get('reports/savings'),
  getInflationWaveReport: () => get('reports/inflation-wave'),
  getSupplierBehaviorReport: () => get('reports/supplier-behavior'),

  // Dashboard
  getDashboard: () => get('dashboard'),

  // Seed
  seedSampleData: () => post('seed'),
  resetSampleData: () => post('seed/reset'),

  // Billing
  getBillingPlan: () => get('billing/plan'),
  startCheckout: () => post('billing/checkout'),
  openBillingPortal: () => post('billing/portal'),
}

export default api
