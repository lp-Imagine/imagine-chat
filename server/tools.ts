import * as cheerio from 'cheerio'

function truncate(str: string, maxLen = 8000): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + `... (截断，原${str.length}字符)`
}

export const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_weather',
      description: '获取指定城市的实时天气信息',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称，例如北京' }
        },
        required: ['city']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: '使用必应搜索引擎搜索互联网，返回相关网页标题、摘要、URL，可用于获取最新信息',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'order_food',
      description: '搜索可点外卖的商家和菜品。当用户想点外卖、叫餐、订餐、买吃的时调用此工具。返回商家列表和菜品信息，需要前端渲染卡片让用户选择。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '用户想吃的食物类型，如"汉堡"、"披萨"、"寿司"、"中餐"等' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_clothes',
      description: '搜索衣服商品。当用户想买衣服、找穿搭、搜索服饰时调用此工具。返回衣服商品列表，需要前端渲染卡片让用户浏览和选择。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '用户想找的衣服类型，如"T恤"、"连衣裙"、"运动鞋"、"羽绒服"等' }
        },
        required: ['query']
      }
    }
  }
]

/** 卡片工具名称集合：这些工具的结果需要前端渲染交互卡片，不经过大模型总结 */
export const CARD_TOOLS = new Set(['order_food', 'search_clothes'])

async function getWeather(args: { city: string }): Promise<string> {
  try {
    const url = `https://wttr.in/${encodeURIComponent(args.city)}?format=%l：%c+%t(体感%f)，%h，风速%w`
    const resp = await fetch(url)
    if (!resp.ok) return `天气查询失败(HTTP ${resp.status})`
    return await resp.text()
  } catch (e: any) {
    return `天气查询失败: ${e.message}`
  }
}

function sanitize(text: string): string {
  return text
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[​-‍﻿]/g, '')
    .replace(/�/g, '')
    .trim()
}

async function webSearch(args: { query: string }): Promise<string> {
  try {
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(args.query)}&ensearch=1`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    })
    if (!resp.ok) return `搜索失败(HTTP ${resp.status})`
    const html = await resp.text()
    const $ = cheerio.load(html)

    const results: { title: string; snippet: string; url: string }[] = []
    $('li.b_algo, div.b_algo').each((_i, el) => {
      const $el = $(el)
      const title = sanitize($el.find('h2').first().text())
      const snippet = sanitize($el.find('.b_caption p, .b_lineclamp2').first().text() || $el.find('p').first().text())
      let url = $el.find('a').first().attr('href') || ''
      if (url && url.startsWith('/')) url = 'https://cn.bing.com' + url
      if (title && snippet && url) {
        results.push({ title, snippet, url })
      }
    })

    if (!results.length) {
      const pageText = sanitize($('body').text())
      return `搜索结果受限，请尝试精简搜索词\n页面摘要：${truncate(pageText, 4000)}`
    }

    return results
      .slice(0, 8)
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`)
      .join('\n\n')
  } catch (e: any) {
    return `搜索失败: ${e.message}`
  }
}

// ========== 卡片工具处理函数 ==========

interface FoodItem {
  id: string
  name: string
  price: number
  image: string
  description: string
}

interface Restaurant {
  id: string
  name: string
  rating: number
  deliveryTime: string
  deliveryFee: number
  image: string
  items: FoodItem[]
}

async function orderFood(args: { query: string }): Promise<string> {
  const q = args.query.toLowerCase()

  // 模拟不同食物类型的商家数据
  const restaurantDB: Record<string, Restaurant[]> = {
    汉堡: [
      {
        id: 'r1', name: '麦当劳', rating: 4.5, deliveryTime: '30分钟', deliveryFee: 5,
        image: '🍔',
        items: [
          { id: 'f1', name: '巨无霸套餐', price: 36, image: '🍔', description: '巨无霸+中薯条+中可乐' },
          { id: 'f2', name: '麦辣鸡腿堡套餐', price: 32, image: '🍗', description: '麦辣鸡腿堡+中薯条+中可乐' },
          { id: 'f3', name: '麦香鱼套餐', price: 30, image: '🐟', description: '麦香鱼+中薯条+中可乐' },
          { id: 'f4', name: '板烧鸡腿堡套餐', price: 34, image: '🍗', description: '板烧鸡腿堡+中薯条+中可乐' }
        ]
      },
      {
        id: 'r2', name: '汉堡王', rating: 4.3, deliveryTime: '35分钟', deliveryFee: 6,
        image: '👑',
        items: [
          { id: 'f5', name: '皇堡套餐', price: 39, image: '🍔', description: '招牌皇堡+薯条+可乐' },
          { id: 'f6', name: '双层芝士牛堡套餐', price: 42, image: '🧀', description: '双层芝士牛堡+薯条+可乐' },
          { id: 'f7', name: '鸡腿堡套餐', price: 33, image: '🍗', description: '脆皮鸡腿堡+薯条+可乐' }
        ]
      }
    ],
    披萨: [
      {
        id: 'r3', name: '必胜客', rating: 4.4, deliveryTime: '40分钟', deliveryFee: 8,
        image: '🍕',
        items: [
          { id: 'f8', name: '超级至尊披萨 9寸', price: 69, image: '🍕', description: '经典超级至尊，多种肉类蔬菜' },
          { id: 'f9', name: '海鲜披萨 9寸', price: 75, image: '🦐', description: '鲜虾鱿鱼扇贝，海味十足' },
          { id: 'f10', name: '夏威夷披萨 9寸', price: 59, image: '🍍', description: '火腿菠萝经典搭配' }
        ]
      }
    ],
    寿司: [
      {
        id: 'r4', name: '元气寿司', rating: 4.7, deliveryTime: '45分钟', deliveryFee: 10,
        image: '🍣',
        items: [
          { id: 'f11', name: '三文鱼刺身', price: 48, image: '🐟', description: '新鲜三文鱼 8片' },
          { id: 'f12', name: '综合寿司拼盘', price: 88, image: '🍣', description: '12贯不同口味手握寿司' },
          { id: 'f13', name: '鳗鱼饭', price: 58, image: '🍱', description: '蒲烧鳗鱼配米饭、味噌汤' }
        ]
      }
    ],
    中餐: [
      {
        id: 'r5', name: '湘味小厨', rating: 4.6, deliveryTime: '25分钟', deliveryFee: 4,
        image: '🌶️',
        items: [
          { id: 'f14', name: '辣椒炒肉+米饭', price: 28, image: '🌶️', description: '正宗湖南小炒肉配米饭' },
          { id: 'f15', name: '红烧排骨+米饭', price: 35, image: '🍖', description: '秘制红烧排骨配时蔬米饭' },
          { id: 'f16', name: '蒜蓉西兰花+米饭', price: 22, image: '🥦', description: '清爽蒜蓉西兰花配米饭' }
        ]
      },
      {
        id: 'r6', name: '粤港茶餐厅', rating: 4.5, deliveryTime: '30分钟', deliveryFee: 5,
        image: '🥘',
        items: [
          { id: 'f17', name: '叉烧饭', price: 32, image: '🍖', description: '蜜汁叉烧+煎蛋+青菜+米饭' },
          { id: 'f18', name: '干炒牛河', price: 30, image: '🍜', description: '港式经典干炒牛河' },
          { id: 'f19', name: '虾饺皇', price: 25, image: '🥟', description: '鲜虾水晶饺 4只' }
        ]
      }
    ]
  }

  // 模糊匹配食物类型
  let matchedRestaurants: Restaurant[] = []
  for (const [key, restaurants] of Object.entries(restaurantDB)) {
    if (q.includes(key) || key.includes(q)) {
      matchedRestaurants = restaurants
      break
    }
  }

  // 无精确匹配时返回通用列表
  if (!matchedRestaurants.length) {
    matchedRestaurants = [
      {
        id: 'r1', name: '麦当劳', rating: 4.5, deliveryTime: '30分钟', deliveryFee: 5,
        image: '🍔',
        items: [
          { id: 'f1', name: '巨无霸套餐', price: 36, image: '🍔', description: '巨无霸+中薯条+中可乐' },
          { id: 'f2', name: '麦辣鸡腿堡套餐', price: 32, image: '🍗', description: '麦辣鸡腿堡+中薯条+中可乐' }
        ]
      },
      {
        id: 'r5', name: '湘味小厨', rating: 4.6, deliveryTime: '25分钟', deliveryFee: 4,
        image: '🌶️',
        items: [
          { id: 'f14', name: '辣椒炒肉+米饭', price: 28, image: '🌶️', description: '正宗湖南小炒肉配米饭' },
          { id: 'f15', name: '红烧排骨+米饭', price: 35, image: '🍖', description: '秘制红烧排骨配时蔬米饭' }
        ]
      }
    ]
  }

  const totalItems = matchedRestaurants.reduce((sum, r) => sum + r.items.length, 0)
  const names = matchedRestaurants.map(r => r.name).join('、')

  return JSON.stringify({
    tool_name: 'order_food',
    tool_data: {
      query: args.query,
      restaurants: matchedRestaurants
    },
    summary: `已为用户搜索到${matchedRestaurants.length}家外卖商家（${names}），共${totalItems}个菜品。用户可以在前端卡片中浏览商家和菜品，选择后确认下单。`
  })
}

interface ClothesProduct {
  id: string
  name: string
  price: number
  originalPrice: number
  image: string
  store: string
  sales: number
  tags: string[]
}

async function searchClothes(args: { query: string }): Promise<string> {
  const q = args.query.toLowerCase()

  const productDB: Record<string, ClothesProduct[]> = {
    t恤: [
      { id: 'c1', name: '纯棉印花短袖T恤', price: 79, originalPrice: 159, image: '👕', store: '优衣库旗舰店', sales: 23000, tags: ['纯棉', '透气', '百搭'] },
      { id: 'c2', name: '美式复古做旧T恤', price: 129, originalPrice: 259, image: '👕', store: '潮牌集合店', sales: 8900, tags: ['复古', '宽松', '街头'] },
      { id: 'c3', name: '简约纯色打底T恤 2件装', price: 99, originalPrice: 199, image: '👕', store: '南极人旗舰店', sales: 56000, tags: ['基础款', '高性价比', '修身'] },
      { id: 'c4', name: 'oversize 落肩宽松T恤', price: 149, originalPrice: 299, image: '👕', store: '原创设计师店', sales: 12000, tags: ['Oversize', '设计感', '男女同款'] }
    ],
    连衣裙: [
      { id: 'c5', name: '法式茶歇连衣裙', price: 239, originalPrice: 499, image: '👗', store: '衣品天成旗舰店', sales: 15000, tags: ['法式', '收腰', '优雅'] },
      { id: 'c6', name: '碎花雪纺连衣裙', price: 189, originalPrice: 399, image: '👗', store: '茵曼旗舰店', sales: 32000, tags: ['碎花', '雪纺', '仙气'] },
      { id: 'c7', name: '通勤修身针织连衣裙', price: 269, originalPrice: 569, image: '👗', store: 'LILY旗舰店', sales: 8700, tags: ['通勤', '显瘦', '针织'] }
    ],
    运动鞋: [
      { id: 'c8', name: 'Air 缓震跑鞋', price: 499, originalPrice: 899, image: '👟', store: 'Nike旗舰店', sales: 67000, tags: ['缓震', '轻量', '跑步'] },
      { id: 'c9', name: '经典帆布鞋', price: 339, originalPrice: 569, image: '👟', store: 'Converse旗舰店', sales: 45000, tags: ['经典', '帆布', '百搭'] },
      { id: 'c10', name: '复古慢跑鞋', price: 599, originalPrice: 899, image: '👟', store: 'New Balance旗舰店', sales: 28000, tags: ['复古', '舒适', '慢跑'] }
    ],
    羽绒服: [
      { id: 'c11', name: '轻薄白鸭绒羽绒服', price: 399, originalPrice: 899, image: '🧥', store: '波司登旗舰店', sales: 41000, tags: ['白鸭绒', '轻薄', '保暖'] },
      { id: 'c12', name: '中长款加厚羽绒服', price: 899, originalPrice: 1999, image: '🧥', store: 'Canada Goose', sales: 3200, tags: ['加厚', '防风', '极寒'] }
    ]
  }

  let matchedProducts: ClothesProduct[] = []
  for (const [key, products] of Object.entries(productDB)) {
    if (q.includes(key) || key.includes(q)) {
      matchedProducts = products
      break
    }
  }

  if (!matchedProducts.length) {
    // 无精确匹配时合并所有结果
    matchedProducts = Object.values(productDB).flat().slice(0, 8)
  }

  const names = matchedProducts.map(p => p.name).join('、')

  return JSON.stringify({
    tool_name: 'search_clothes',
    tool_data: {
      query: args.query,
      products: matchedProducts
    },
    summary: `已为用户搜索到${matchedProducts.length}件服饰商品（${names}）。用户可以在前端卡片中浏览商品详情，选择后可加入购物车。`
  })
}

export const toolsHandleMap: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  get_weather: (args) => getWeather(args as unknown as { city: string }),
  web_search: (args) => webSearch(args as unknown as { query: string }),
  order_food: (args) => orderFood(args as unknown as { query: string }),
  search_clothes: (args) => searchClothes(args as unknown as { query: string })
}
