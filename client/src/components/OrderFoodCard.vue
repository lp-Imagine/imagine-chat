<template>
  <div class="order-food-card">
    <div class="card-header">
      <span class="card-icon">🍽️</span>
      <span class="card-title">外卖点餐</span>
      <el-tag size="small" type="info" effect="plain" round>"{{ toolData.query }}"</el-tag>
    </div>

    <div class="restaurant-list">
      <div
        v-for="(restaurant, ri) in toolData.restaurants"
        :key="restaurant.id"
        class="restaurant-card"
      >
        <div class="restaurant-header" :style="{ background: restaurantGradient(ri) }">
          <span class="restaurant-image">{{ restaurant.image }}</span>
          <div class="restaurant-info">
            <div class="restaurant-name">{{ restaurant.name }}</div>
            <div class="restaurant-meta">
              <el-rate :model-value="restaurant.rating" disabled show-score size="small" />
              <span class="meta-divider">|</span>
              <span class="delivery-time">{{ restaurant.deliveryTime }}</span>
              <span class="meta-divider">|</span>
              <span class="delivery-fee">配送 ¥{{ restaurant.deliveryFee }}</span>
            </div>
          </div>
        </div>

        <div class="food-scroll">
          <div
            v-for="(item, fi) in restaurant.items"
            :key="item.id"
            class="food-item"
            :class="{ selected: selectedItem?.id === item.id }"
            :style="{ background: itemBg(ri, fi) }"
            @click="selectItem(restaurant, item)"
          >
            <div class="food-emoji-wrap">
              <span class="food-image">{{ item.image }}</span>
            </div>
            <div class="food-name">{{ item.name }}</div>
            <div class="food-desc">{{ item.description }}</div>
            <div class="food-price">¥{{ item.price }}</div>
            <div v-if="selectedItem?.id === item.id" class="food-check">
              <el-icon :size="14"><Check /></el-icon>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Transition name="slide-up">
      <div v-if="selectedItem" class="order-confirm">
        <div class="confirm-left">
          <div class="confirm-img">{{ selectedItem.image }}</div>
          <div class="confirm-info">
            <div class="confirm-detail">
              <strong>{{ selectedRestaurant?.name }}</strong> · {{ selectedItem.name }}
            </div>
            <span class="confirm-price">¥{{ selectedItem.price }}</span>
          </div>
        </div>
        <el-button type="primary" size="small" round @click="confirmOrder">确认下单</el-button>
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
    restaurants: Array<{
      id: string
      name: string
      rating: number
      deliveryTime: string
      deliveryFee: number
      image: string
      items: Array<{
        id: string
        name: string
        price: number
        image: string
        description: string
      }>
    }>
  }
}>()

const emit = defineEmits<{
  confirm: [message: string]
}>()

const selectedItem = ref<{ id: string; name: string; price: number; image?: string } | null>(null)
const selectedRestaurant = ref<{ id: string; name: string } | null>(null)

const restaurantGradients = [
  'linear-gradient(135deg, #fff3e0, #ffe0b2)',
  'linear-gradient(135deg, #fce4ec, #f8bbd0)',
  'linear-gradient(135deg, #e8eaf6, #c5cae9)',
  'linear-gradient(135deg, #e0f2f1, #b2dfdb)',
]

const itemGradients = [
  'linear-gradient(180deg, #fff8e1 0%, transparent 60%)',
  'linear-gradient(180deg, #fce4ec 0%, transparent 60%)',
  'linear-gradient(180deg, #e8eaf6 0%, transparent 60%)',
  'linear-gradient(180deg, #e0f2f1 0%, transparent 60%)',
]

function restaurantGradient(idx: number): string {
  return restaurantGradients[idx % restaurantGradients.length]
}

function itemBg(ri: number, _fi: number): string {
  return itemGradients[ri % itemGradients.length]
}

function selectItem(
  restaurant: typeof props.toolData.restaurants[0],
  item: typeof props.toolData.restaurants[0]['items'][0]
) {
  selectedItem.value = item
  selectedRestaurant.value = restaurant
}

function confirmOrder() {
  if (!selectedItem.value || !selectedRestaurant.value) return
  emit('confirm', `我要在${selectedRestaurant.value.name}下单：${selectedItem.value.name}，¥${selectedItem.value.price}`)
}
</script>

<style scoped>
.order-food-card {
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

/* ---- 商家列表 ---- */
.restaurant-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 14px 14px;
}

.restaurant-card {
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
}

.restaurant-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
}

.restaurant-image {
  font-size: 28px;
  flex-shrink: 0;
}

.restaurant-info {
  flex: 1;
  min-width: 0;
}

.restaurant-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.restaurant-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-divider {
  color: var(--border-primary);
  font-size: 12px;
}

.delivery-time,
.delivery-fee {
  font-size: 11px;
  color: var(--text-muted);
}

/* ---- 菜品横向滚动 ---- */
.food-scroll {
  display: flex;
  gap: 8px;
  padding: 10px 12px 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}

.food-item {
  flex: 0 0 148px;
  scroll-snap-align: start;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

.food-item:hover {
  border-color: transparent;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 0 0 1.5px var(--accent);
  transform: translateY(-2px);
}

.food-item.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1.5px var(--accent), 0 4px 12px var(--accent-ring);
}

.food-emoji-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
}

.food-image {
  font-size: 32px;
  line-height: 1;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.1));
}

.food-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

.food-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.food-price {
  font-size: 16px;
  font-weight: 800;
  color: #f56c6c;
  margin-top: auto;
  letter-spacing: -0.3px;
}

.food-check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px var(--accent-ring);
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

.confirm-img {
  font-size: 24px;
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
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.confirm-detail {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.confirm-price {
  font-size: 15px;
  font-weight: 700;
  color: #f56c6c;
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
.food-scroll::-webkit-scrollbar {
  height: 4px;
}

.food-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.food-scroll::-webkit-scrollbar-thumb {
  background: var(--border-primary);
  border-radius: 4px;
}

.food-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
</style>
