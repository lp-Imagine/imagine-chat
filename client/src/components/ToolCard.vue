<template>
  <OrderFoodCard
    v-if="cardTool.tool_name === 'order_food'"
    :tool-data="cardTool.tool_data"
    @confirm="handleConfirm"
  />
  <SearchClothesCard
    v-else-if="cardTool.tool_name === 'search_clothes'"
    :tool-data="cardTool.tool_data"
    @confirm="handleConfirm"
  />
</template>

<script setup lang="ts">
import OrderFoodCard from './OrderFoodCard.vue'
import SearchClothesCard from './SearchClothesCard.vue'

defineProps<{
  cardTool: { tool_name: string; tool_data: any }
}>()

const emit = defineEmits<{
  confirm: [message: string]
}>()

function handleConfirm(message: string) {
  emit('confirm', message)
}
</script>
