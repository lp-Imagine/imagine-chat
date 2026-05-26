<template>
  <div class="search-clothes-card">
    <div class="card-header">
      <span class="card-icon">👗</span>
      <span class="card-title">服饰搜索</span>
      <el-tag size="small" type="info" round>"{{ toolData.query }}"</el-tag>
    </div>

    <div class="product-grid">
      <div
        v-for="product in toolData.products"
        :key="product.id"
        class="product-card"
        :class="{ selected: selectedProduct?.id === product.id }"
        @click="selectProduct(product)"
      >
        <div class="product-image">{{ product.image }}</div>
        <div class="product-body">
          <div class="product-name">{{ product.name }}</div>
          <div class="product-store">{{ product.store }}</div>
          <div class="product-meta">
            <span class="product-sales">已售 {{ fmtSales(product.sales) }}</span>
            <span class="product-discount">{{ discount(product) }}折</span>
          </div>
          <div class="product-pricing">
            <span class="product-price">¥{{ product.price }}</span>
            <span class="product-original-price">¥{{ product.originalPrice }}</span>
          </div>
          <div class="product-tags">
            <span
              v-for="tag in product.tags"
              :key="tag"
              class="product-tag"
            >{{ tag }}</span>
          </div>
        </div>
        <div v-if="selectedProduct?.id === product.id" class="selected-mark">
          <el-icon :size="14"><Check /></el-icon>
        </div>
      </div>
    </div>

    <Transition name="slide-up">
      <div v-if="selectedProduct" class="order-confirm">
        <div class="confirm-info">
          <el-icon :size="16"><Check /></el-icon>
          已选 <strong>{{ selectedProduct.name }}</strong>
          <span class="confirm-price">¥{{ selectedProduct.price }}</span>
          <span class="confirm-original">¥{{ selectedProduct.originalPrice }}</span>
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
  border-radius: 12px;
  margin: 8px 0;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 10px;
}

.card-icon {
  font-size: 18px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

/* ---- 商品网格 ---- */
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
  gap: 10px;
  padding: 0 16px;
}

.product-card {
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: fit-content;
}

.product-card:hover {
  border-color: var(--accent);
  box-shadow: 0 2px 12px var(--accent-ring);
  transform: translateY(-1px);
}

.product-card.selected {
  border-color: var(--accent);
  background: var(--accent-ring);
}

.product-image {
  font-size: 40px;
  text-align: center;
  padding: 14px 0 8px;
  line-height: 1;
}

.product-body {
  padding: 0 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
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

.product-store {
  font-size: 11px;
  color: var(--text-muted);
}

.product-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.product-sales {
  font-size: 11px;
  color: var(--text-muted);
}

.product-discount {
  font-size: 10px;
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
}

.product-pricing {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.product-price {
  font-size: 16px;
  font-weight: 700;
  color: #f56c6c;
}

.product-original-price {
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: line-through;
}

.product-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.product-tag {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-input);
  padding: 1px 6px;
  border-radius: 4px;
}

.selected-mark {
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 28px 28px 0;
  border-color: transparent var(--accent) transparent transparent;
}

.selected-mark .el-icon {
  position: absolute;
  top: 3px;
  right: -27px;
  color: #fff;
}

/* ---- 确认栏 ---- */
.order-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-input);
  border-top: 1px solid var(--border-subtle);
  gap: 10px;
}

.confirm-info {
  font-size: 13px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.confirm-price {
  font-weight: 700;
  color: #f56c6c;
  margin-left: 4px;
}

.confirm-original {
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: line-through;
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
</style>
