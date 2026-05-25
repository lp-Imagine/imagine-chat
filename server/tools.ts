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
  }
]

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

export const toolsHandleMap: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  get_weather: (args) => getWeather(args as unknown as { city: string }),
  web_search: (args) => webSearch(args as unknown as { query: string })
}
