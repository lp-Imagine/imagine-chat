<template>
  <!-- 桌面端：弹窗 -->
  <el-dialog
    v-if="!isMobile"
    v-model="visible"
    title="知识库管理"
    width="680px"
    class="kb-dialog"
    :close-on-click-modal="false"
    append-to-body
    @open="onOpen"
  >
    <div class="kb-dialog-body">
      <!-- 上传区 -->
      <div class="kb-section">
        <label class="kb-label">上传文档</label>
        <p class="kb-desc">支持 txt、md、pdf、docx、xlsx 格式，最大 10MB。上传后自动分块并向量化。</p>
        <div class="kb-upload-bar">
          <input
            ref="fileInput"
            type="file"
            accept=".txt,.md,.pdf,.docx,.xlsx"
            class="kb-file-input"
            @change="onFileChange"
          />
          <el-button type="primary" size="small" :loading="uploading" @click="triggerUpload">
            <el-icon :size="14"><Upload /></el-icon>
            选择文件
          </el-button>
          <span v-if="selectedFile" class="kb-file-name">{{ selectedFile.name }}</span>
        </div>
        <p v-if="uploadError" class="kb-error">{{ uploadError }}</p>
      </div>

      <!-- 文档列表 -->
      <div class="kb-section">
        <div class="kb-list-header">
          <label class="kb-label">已上传文档 ({{ docs.length }})</label>
          <el-button
            v-if="selectedIds.length"
            type="danger"
            size="small"
            text
            @click="onBatchDelete"
          >
            批量删除 ({{ selectedIds.length }})
          </el-button>
        </div>
        <div v-if="docs.length" class="kb-table-wrap">
          <el-table
            ref="desktopTableRef"
            :data="docs"
            size="small"
            style="width: 100%"
            @selection-change="onSelectionChange"
          >
            <el-table-column type="selection" width="36" />
            <el-table-column prop="fileName" label="文件名" min-width="160" show-overflow-tooltip />
            <el-table-column prop="fileType" label="类型" width="60" align="center" />
            <el-table-column prop="chunkCount" label="分块数" width="70" align="center" />
            <el-table-column label="上传时间" width="140" align="center">
              <template #default="{ row }">
                {{ fmtDate(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70" align="center">
              <template #default="{ row }">
                <el-popconfirm
                  title="确定删除此文档及其所有向量数据？"
                  confirm-button-text="删除"
                  @confirm="onDelete(row.id)"
                >
                  <template #reference>
                    <el-button type="danger" size="small" text>删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="kb-empty">暂无文档，上传 txt / md / pdf 文件构建知识库</div>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>

  <!-- 移动端：侧边滑入面板 -->
  <Teleport v-else to="body">
    <transition name="kb-panel-fade">
      <div v-if="visible" class="kb-backdrop" @click="onCancel" />
    </transition>
    <transition name="kb-panel-slide">
      <div v-if="visible" class="kb-panel">
        <div class="kb-panel-header">
          <el-button :icon="ArrowLeft" text class="kb-panel-back" @click="onCancel" />
          <span class="kb-panel-title">知识库管理</span>
          <span />
        </div>
        <div class="kb-panel-body">
          <!-- 上传区 -->
          <div class="kb-section">
            <label class="kb-label">上传文档</label>
            <p class="kb-desc">支持 txt、md、pdf、docx、xlsx 格式，最大 10MB。</p>
            <div class="kb-upload-bar">
              <input
                ref="mobileFileInput"
                type="file"
                accept=".txt,.md,.pdf,.docx,.xlsx"
                class="kb-file-input"
                @change="onFileChange"
              />
              <el-button type="primary" size="small" :loading="uploading" @click="triggerMobileUpload">
                <el-icon :size="14"><Upload /></el-icon>
                选择文件
              </el-button>
              <span v-if="selectedFile" class="kb-file-name">{{ selectedFile.name }}</span>
            </div>
          </div>

          <!-- 文档列表 -->
          <div class="kb-section">
            <div class="kb-list-header">
              <label class="kb-label">已上传文档 ({{ docs.length }})</label>
              <el-button
                v-if="selectedIds.length"
                type="danger"
                size="small"
                text
                @click="onBatchDelete"
              >
                批量删除 ({{ selectedIds.length }})
              </el-button>
            </div>
            <div v-if="docs.length" class="kb-table-wrap">
              <el-table
                ref="mobileTableRef"
                :data="docs"
                size="small"
                style="width: 100%"
                @selection-change="onSelectionChange"
              >
                <el-table-column type="selection" width="32" />
                <el-table-column prop="fileName" label="文件名" min-width="120" show-overflow-tooltip />
                <el-table-column prop="fileType" label="类型" width="50" align="center" />
                <el-table-column prop="chunkCount" label="分块" width="50" align="center" />
                <el-table-column label="操作" width="60" align="center">
                  <template #default="{ row }">
                    <el-popconfirm
                      title="确定删除？"
                      confirm-button-text="删除"
                      @confirm="onDelete(row.id)"
                    >
                      <template #reference>
                        <el-button type="danger" size="small" text>删除</el-button>
                      </template>
                    </el-popconfirm>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <div v-else class="kb-empty">暂无文档</div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Upload } from '@element-plus/icons-vue'
import { api } from '@/api'
import { useMobile } from '@/composables/useMobile'
import type { KnowledgeDoc } from '@/types/chat'

const visible = defineModel<boolean>({ required: true })

const docs = ref<KnowledgeDoc[]>([])
const fileInput = ref<HTMLInputElement>()
const mobileFileInput = ref<HTMLInputElement>()
const desktopTableRef = ref()
const mobileTableRef = ref()
const selectedFile = ref<File | null>(null)
const selectedIds = ref<string[]>([])
const uploading = ref(false)
const uploadError = ref('')

const { isMobile } = useMobile()

watch(visible, (v) => {
  if (v) onOpen()
})

function triggerUpload() {
  fileInput.value?.click()
}

function triggerMobileUpload() {
  mobileFileInput.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadError.value = ''

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['txt', 'md', 'pdf', 'docx', 'xlsx'].includes(ext)) {
    uploadError.value = '仅支持 txt、md、pdf、docx、xlsx 文件'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    uploadError.value = '文件大小不能超过 10MB'
    return
  }

  selectedFile.value = file
  uploadFile(file)
}

async function uploadFile(file: File) {
  uploading.value = true
  try {
    const doc = await api.uploadKnowledgeDoc(file)
    docs.value.unshift(doc)
    selectedFile.value = null
    ElMessage.success(`"${doc.fileName}" 上传成功，已分 ${doc.chunkCount} 块`)
  } catch (e: any) {
    uploadError.value = e.message || '上传失败'
  } finally {
    uploading.value = false
    // 清空 input 以便重新选择同一文件
    if (fileInput.value) fileInput.value.value = ''
    if (mobileFileInput.value) mobileFileInput.value.value = ''
  }
}

function onSelectionChange(rows: KnowledgeDoc[]) {
  selectedIds.value = rows.map(r => r.id)
}

async function onDelete(id: string) {
  try {
    await api.deleteKnowledgeDoc(id)
    docs.value = docs.value.filter(d => d.id !== id)
    selectedIds.value = selectedIds.value.filter(sid => sid !== id)
    ElMessage.success('文档已删除')
  } catch {
    ElMessage.error('删除失败')
  }
}

async function onBatchDelete() {
  if (!selectedIds.value.length) return
  try {
    const { deleted } = await api.batchDeleteKnowledgeDocs(selectedIds.value)
    docs.value = docs.value.filter(d => !selectedIds.value.includes(d.id))
    selectedIds.value = []
    ElMessage.success(`已删除 ${deleted} 个文档`)
  } catch {
    ElMessage.error('批量删除失败')
  }
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function onOpen() {
  uploadError.value = ''
  selectedFile.value = null
  try {
    docs.value = await api.getKnowledgeDocuments()
  } catch {
    // ignore
  }
}

function onCancel() {
  visible.value = false
}
</script>

<style scoped>
/* ====== 共享样式 ====== */

.kb-dialog-body,
.kb-panel-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.kb-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kb-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.kb-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.6;
}

.kb-upload-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.kb-file-input {
  display: none;
}

.kb-file-name {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-error {
  font-size: 12px;
  color: #f56c6c;
  margin: 2px 0 0;
}

.kb-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kb-table-wrap {
  margin-top: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;
}

.kb-empty {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  padding: 24px 0;
}

/* ====== 桌面端 ====== */
@media (min-width: 769px) {
  .kb-dialog-body {
    gap: 20px;
  }
}

/* ====== 移动端侧滑面板 ====== */

.kb-backdrop {
  display: none;
}

.kb-panel {
  display: none;
}

@media (max-width: 768px) {
  .kb-dialog-body {
    gap: 16px;
  }

  /* 侧滑面板 */
  .kb-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  .kb-panel {
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 110;
    width: 88vw;
    max-width: 380px;
    background: var(--bg-chat);
    box-shadow: -4px 0 32px rgba(0, 0, 0, 0.4);
  }

  .kb-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .kb-panel-back {
    width: 36px;
    height: 36px;
    color: var(--text-muted);
  }

  .kb-panel-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .kb-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    gap: 20px;
  }

  .kb-desc {
    font-size: 12px;
  }

  /* 过渡动画 */
  .kb-panel-fade-enter-active,
  .kb-panel-fade-leave-active {
    transition: opacity 0.3s ease;
  }
  .kb-panel-fade-enter-from,
  .kb-panel-fade-leave-to {
    opacity: 0;
  }

  .kb-panel-slide-enter-active,
  .kb-panel-slide-leave-active {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .kb-panel-slide-enter-from,
  .kb-panel-slide-leave-to {
    transform: translateX(100%);
  }
}
</style>

<!-- 桌面端弹窗覆写（非 scoped） -->
<style>
.kb-dialog .el-dialog__body {
  max-height: 60vh;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
