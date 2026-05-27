<template>
  <div class="search-clothes-card">
    <div class="card-header">
      <span class="card-icon">👗</span>
      <span class="card-title">服饰搜索</span>
      <el-tag size="small" type="info" effect="plain" round>"{{ toolData.query }}"</el-tag>
    </div>

    <div class="product-scroll">
      <div
        v-for="product in toolData.products"
        :key="product.id"
        class="product-card"
        :class="{ selected: selectedProduct?.id === product.id }"
        @click="selectProduct(product)"
      >
        <div class="product-image" :style="{ background: gradientBg(product.id) }">
          <span class="product-emoji">{{ product.image }}</span>
          <span class="product-discount-badge">{{ discount(product) }}折</span>
        </div>
        <div class="product-body">
          <div class="product-store">{{ product.store }}</div>
          <div class="product-name">{{ product.name }}</div>
          <div class="product-tags">
            <span
              v-for="tag in product.tags"
              :key="tag"
              class="product-tag"
              :style="{ background: tagColor(tag) }"
            >{{ tag }}</span>
          </div>
          <div class="product-footer">
            <div class="product-pricing">
              <span class="product-price">¥{{ product.price }}</span>
              <span class="product-original-price">¥{{ product.originalPrice }}</span>
            </div>
            <span class="product-sales">已售{{ fmtSales(product.sales) }}</span>
          </div>
        </div>
        <div v-if="selectedProduct?.id === product.id" class="selected-mark">
          <el-icon :size="12"><Check /></el-icon>
        </div>
      </div>
    </div>

    <Transition name="slide-up">
      <div v-if="selectedProduct" class="order-confirm">
        <div class="confirm-left">
          <div class="confirm-product-img">{{ selectedProduct.image }}</div>
          <div class="confirm-info">
            <div class="confirm-name">{{ selectedProduct.name }}</div>
            <div class="confirm-pricing">
              <span class="confirm-price">¥{{ selectedProduct.price }}</span>
              <span class="confirm-original">¥{{ selectedProduct.originalPrice }}</span>
              <span class="confirm-save">省¥{{ selectedProduct.originalPrice - selectedProduct.price }}</span>
            </div>
          </div>
        </div>
        <el-button type="primary" size="small" round @click="confirmOrder">加入购物车</el-button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Check } from '@element-plus/icons-vue'

const props = defineProps<{
  toolData: {
    query: string
    products: Array<{
      id: string
      name: string
      price: number
      originalPrice: number
      image: string
      store: string
      sales: number
      tags: string[]
    }>
  }
}>()

const emit = defineEmits<{
  confirm: [message: string]
}>()

const selectedProduct = ref<(typeof props.toolData.products)[0] | null>(null)

const gradients = [
  'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 50%, #f48fb1 100%)',
  'linear-gradient(135deg, #e8eaf6 0%, #c5cae9 50%, #9fa8da 100%)',
  'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 50%, #ffcc80 100%)',
  'linear-gradient(135deg, #e0f2f1 0%, #b2dfdb 50%, #80cbc4 100%)',
  'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 50%, #ce93d8 100%)',
  'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 50%, #a5d6a7 100%)',
]

function gradientBg(id: string): string {
  const idx = parseInt(id, 36) % gradients.length
  return gradients[Math.abs(idx)]
}

const tagColorMap: Record<string, string> = {
  '新品': '#e8f5e9',
  '热卖': '#fce4ec',
  '限时': '#fff3e0',
  '包邮': '#e3f2fd',
  '品质': '#f3e5f5',
}

function tagColor(tag: string): string {
  for (const [key, color] of Object.entries(tagColorMap)) {
    if (tag.includes(key)) return color
  }
  return '#f5f5f5'
}

function fmtSales(n: number): string {
  return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n)
}

function discount(p: typeof props.toolData.products[0]): string {
  return ((p.price / p.originalPrice) * 10).toFixed(1)
}

function selectProduct(product: typeof props.toolData.products[0]) {
  selectedProduct.value = product
}

function confirmOrder() {
  if (!selectedProduct.value) return
  emit('confirm', `我要购买：${selectedProduct.value.name}，¥${selectedProduct.value.price}`)
}
</script>

<style scoped>
.search-clothes-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  margin: 8px 0;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 8px;
}

.card-icon {
  font-size: 18px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

/* ---- 横向滚动 ---- */
.product-scroll {
  display: flex;
  gap: 10px;
  padding: 8px 14px 14px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}

.product-card {
  flex: 0 0 172px;
  scroll-snap-align: start;
  background: var(--bg-chat);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.product-card:hover {
  border-color: transparent;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1), 0 0 0 1.5px var(--accent);
  transform: translateY(-2px);
}

.product-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1.5px var(--accent), 0 4px 16px var(--accent-ring);
}

/* ---- 图片区 ---- */
.product-image {
  position: relative;
  height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.product-emoji {
  font-size: 48px;
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
}

.product-discount-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #ff6b6b, #f56c6c);
  padding: 2px 8px;
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(245,108,108,0.3);
}

/* ---- 信息区 ---- */
.product-body {
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.product-store {
  font-size: 11px;
  color: var(--text-muted);
}

.product-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.product-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 1px;
}

.product-tag {
  font-size: 10px;
  color: var(--text-secondary);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.product-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 4px;
  margin-top: auto;
  padding-top: 6px;
}

.product-pricing {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.product-price {
  font-size: 17px;
  font-weight: 800;
  color: #f56c6c;
  letter-spacing: -0.5px;
}

.product-original-price {
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: line-through;
}

.product-sales {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---- 选中标记 ---- */
.selected-mark {
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 26px 26px 0;
  border-color: transparent var(--accent) transparent transparent;
  z-index: 2;
}

.selected-mark .el-icon {
  position: absolute;
  top: 2px;
  right: -25px;
  color: #fff;
}

/* ---- 确认栏 ---- */
.order-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-input);
  border-top: 1px solid var(--border-subtle);
  gap: 12px;
}

.confirm-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.confirm-product-img {
  font-size: 26px;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-chat);
  border-radius: 8px;
}

.confirm-info {
  min-width: 0;
}

.confirm-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.confirm-pricing {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 1px;
}

.confirm-price {
  font-size: 15px;
  font-weight: 700;
  color: #f56c6c;
}

.confirm-original {
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: line-through;
}

.confirm-save {
  font-size: 10px;
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
}

/* ---- 过渡动画 ---- */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ---- 滚动条 ---- */
.product-scroll::-webkit-scrollbar {
  height: 4px;
}

.product-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.product-scroll::-webkit-scrollbar-thumb {
  background: var(--border-primary);
  border-radius: 4px;
}

.product-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
</style>
