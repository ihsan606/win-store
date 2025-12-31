import type { PlasmoCSConfig, PlasmoGetInlineAnchor } from "plasmo"
import { useEffect, useState } from "react"
import iconUrl from "data-base64:~/assets/icon.png"

import cssText from "data-text:~/contents/shopee-overlay.css"

export const config: PlasmoCSConfig = {
    matches: ["https://shopee.co.id/search*"],
    run_at: "document_end"
}

export const getStyle = () => {
    const style = document.createElement("style")
    style.textContent = cssText
    return style
}

export const getShadowHostId = () => "datatoko-search-stats"

export const getInlineAnchor: PlasmoGetInlineAnchor = async () => {
    while (true) {
        const header = document.querySelector(".shopee-search-result-header")
        if (header) return header
        await new Promise(r => setTimeout(r, 500))
    }
}

interface SearchItem {
    itemid: number
    shopid: number
    name: string
    price: number
    price_min: number
    price_max: number
    historical_sold: number
    item_rating?: {
        rating_star: number
        rating_count: number[]
    }
    is_official_shop?: boolean
    shop_location?: string
    cmt_count?: number
    liked_count?: number
    image?: string
    stock?: number
    discount?: number
}

interface SearchStats {
    keyword: string
    totalProducts: number
    sampleSize: number
    totalSold: number
    totalRevenue: number
    avgPrice: number
    avgRating: number
    officialShopCount: number
    officialShopPercent: number
    timestamp: number
}

// Color palette
const colors = {
    primary: '#1A352B',
    primaryHover: '#243d33',
    accentLight: 'rgba(26, 53, 43, 0.05)',
    accentBorder: 'rgba(26, 53, 43, 0.15)',
    textPrimary: '#1f2937',
    textSecondary: '#6b7280',
    success: '#059669',
    border: '#e5e7eb',
    background: '#ffffff'
}

// Format currency
const formatCurrency = (value: number): string => {
    if (value >= 1000000000) return `Rp ${(value / 1000000000).toFixed(1)}M`
    if (value >= 1000000) return `Rp ${(value / 1000000).toFixed(1)}JT`
    if (value >= 1000) return `Rp ${(value / 1000).toFixed(0)}RB`
    return `Rp ${value.toFixed(0)}`
}

// Format number
const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}JT`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}RB`
    return num.toLocaleString('id-ID')
}

// Format price
const formatPrice = (price: number) => {
    if (!price) return "Rp 0"
    return `Rp ${price.toLocaleString("id-ID")}`
}

// Get keyword from URL
const getKeywordFromUrl = (): string => {
    const params = new URLSearchParams(window.location.search)
    return params.get('keyword') || ''
}

// Storage constants
const STORAGE_KEY = 'datatoko_search_history'
const RETENTION_DAYS = 7
const MAX_PRODUCTS_PER_KEYWORD = 500
const MAX_KEYWORDS = 5
const MAX_TOTAL_PRODUCTS = 2500

// Storage data structure
interface StoredSearchData {
    keyword: string
    stats: SearchStats
    products: SearchItem[]
    updatedAt: number
}

interface SearchHistoryStorage {
    searches: StoredSearchData[]
    lastCleanup: number
}

// Calculate total products in storage
const getTotalProducts = (searches: StoredSearchData[]): number => {
    return searches.reduce((sum, s) => sum + s.products.length, 0)
}

// Save search data to storage
const saveSearchToStorage = async (keyword: string, stats: SearchStats, products: SearchItem[]) => {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY)
        const storage: SearchHistoryStorage = result[STORAGE_KEY] || { searches: [], lastCleanup: 0 }

        // Find existing entry for this keyword
        const existingIndex = storage.searches.findIndex(s => s.keyword.toLowerCase() === keyword.toLowerCase())

        // Prepare data (limit products per keyword)
        const dataToSave: StoredSearchData = {
            keyword,
            stats,
            products: products.slice(0, MAX_PRODUCTS_PER_KEYWORD),
            updatedAt: Date.now()
        }

        if (existingIndex >= 0) {
            // Update existing
            storage.searches[existingIndex] = dataToSave
        } else {
            // Add new
            storage.searches.push(dataToSave)
        }

        // Sort by updatedAt (newest first)
        storage.searches.sort((a, b) => b.updatedAt - a.updatedAt)

        // Enforce MAX_KEYWORDS limit - remove oldest entries
        while (storage.searches.length > MAX_KEYWORDS) {
            storage.searches.pop()
        }

        // Enforce MAX_TOTAL_PRODUCTS limit - reduce products from oldest entries
        while (getTotalProducts(storage.searches) > MAX_TOTAL_PRODUCTS && storage.searches.length > 0) {
            // Find entry with most products and reduce it
            const sorted = [...storage.searches].sort((a, b) => b.products.length - a.products.length)
            const largest = sorted[0]
            const idx = storage.searches.findIndex(s => s.keyword === largest.keyword)
            if (idx >= 0) {
                // Reduce by 100 products or remove if too small
                if (storage.searches[idx].products.length > 100) {
                    storage.searches[idx].products = storage.searches[idx].products.slice(0, storage.searches[idx].products.length - 100)
                } else {
                    storage.searches.splice(idx, 1)
                }
            }
        }

        // Run cleanup if needed (once per day)
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)
        if (storage.lastCleanup < oneDayAgo) {
            const retentionCutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000)
            storage.searches = storage.searches.filter(s => s.updatedAt > retentionCutoff)
            storage.lastCleanup = Date.now()
        }

        await chrome.storage.local.set({ [STORAGE_KEY]: storage })
    } catch (e) {
        console.error('[DataToko] Failed to save search data:', e)
    }
}

// Load search data from storage
const loadSearchFromStorage = async (keyword: string): Promise<StoredSearchData | null> => {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY)
        const storage: SearchHistoryStorage = result[STORAGE_KEY] || { searches: [], lastCleanup: 0 }

        const entry = storage.searches.find(s => s.keyword.toLowerCase() === keyword.toLowerCase())

        if (entry) {
            // Check if still within retention period
            const retentionCutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000)
            if (entry.updatedAt > retentionCutoff) {
                return entry
            }
        }

        return null
    } catch (e) {
        console.error('[DataToko] Failed to load search data:', e)
        return null
    }
}

// Get search history list
const getSearchHistory = async (): Promise<StoredSearchData[]> => {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY)
        const storage: SearchHistoryStorage = result[STORAGE_KEY] || { searches: [], lastCleanup: 0 }

        const retentionCutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000)
        return storage.searches
            .filter(s => s.updatedAt > retentionCutoff)
            .sort((a, b) => b.updatedAt - a.updatedAt)
    } catch (e) {
        console.error('[DataToko] Failed to get search history:', e)
        return []
    }
}

// Analysis Modal Component
const SearchAnalysisModal = ({
    products,
    keyword,
    onClose
}: {
    products: SearchItem[]
    keyword: string
    onClose: () => void
}) => {
    const [viewMode, setViewMode] = useState<'table' | 'card'>('table')

    const getRevenue = (product: SearchItem) => {
        let price = product.price_min || product.price || 0
        if (price > 1000000000) price = price / 100000
        return (product.historical_sold || 0) * price
    }

    const getPrice = (product: SearchItem) => {
        let price = product.price_min || product.price || 0
        if (price > 1000000000) price = price / 100000
        return price
    }

    const sortedProducts = [...products].sort((a, b) => getRevenue(b) - getRevenue(a))

    // Check if product is in top 10
    const isTopTen = (index: number) => index < 10

    // Open product detail page
    const openProductPage = (product: SearchItem) => {
        if (product.shopid && product.itemid) {
            window.open(`https://shopee.co.id/product/${product.shopid}/${product.itemid}`, '_blank')
        }
    }

    const totalSold = products.reduce((sum, p) => sum + (p.historical_sold || 0), 0)
    const totalRevenue = products.reduce((sum, p) => sum + getRevenue(p), 0)
    const avgRating = products.length > 0
        ? products.reduce((sum, p) => sum + (p.item_rating?.rating_star || 0), 0) / products.length
        : 0

    const exportToCSV = () => {
        const headers = ["No", "Nama Produk", "Harga", "Terjual", "Rating", "Est. Omset", "Official", "Item ID"]
        const rows = sortedProducts.map((p, i) => [
            i + 1,
            `"${(p.name || "").replace(/"/g, '""')}"`,
            getPrice(p),
            p.historical_sold || 0,
            p.item_rating?.rating_star?.toFixed(2) || 0,
            getRevenue(p),
            p.is_official_shop ? "Yes" : "No",
            p.itemid
        ])

        const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n")
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `keyword_${keyword.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    return (
        <div className="win-modal-overlay" onClick={onClose}>
            <div className="win-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '1000px' }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '20px 24px',
                    borderBottom: `1px solid ${colors.border}`
                }}>
                    <div>
                        <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: colors.textPrimary
                        }}>
                            Analisa Keyword: "{keyword}"
                        </div>
                        <div style={{
                            fontSize: '13px',
                            color: colors.textSecondary,
                            marginTop: '4px'
                        }}>
                            {products.length} produk • Terjual: {formatNumber(totalSold)} • Est. Omset: {formatCurrency(totalRevenue)} • Rating: {avgRating.toFixed(1)}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Pill Toggle */}
                        <div style={{
                            display: 'flex',
                            border: `1px solid ${colors.border}`,
                            borderRadius: '6px',
                            padding: '2px',
                            background: '#f9fafb'
                        }}>
                            <button
                                onClick={() => setViewMode('table')}
                                style={{
                                    padding: '6px 14px',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    background: viewMode === 'table' ? colors.primary : 'transparent',
                                    color: viewMode === 'table' ? 'white' : colors.textSecondary,
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                Table
                            </button>
                            <button
                                onClick={() => setViewMode('card')}
                                style={{
                                    padding: '6px 14px',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    background: viewMode === 'card' ? colors.primary : 'transparent',
                                    color: viewMode === 'card' ? 'white' : colors.textSecondary,
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                Card
                            </button>
                        </div>
                        <button
                            onClick={exportToCSV}
                            style={{
                                padding: '8px 16px',
                                fontSize: '13px',
                                fontWeight: '500',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                background: colors.primary,
                                color: 'white',
                                transition: 'background 0.15s ease'
                            }}
                        >
                            Download CSV
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                width: '32px',
                                height: '32px',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                background: 'transparent',
                                color: colors.textSecondary,
                                fontSize: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
                    {products.length === 0 ? (
                        <div style={{
                            padding: '60px 24px',
                            textAlign: 'center',
                            color: colors.textSecondary
                        }}>
                            <p>Belum ada produk yang ter-capture.</p>
                            <p style={{ fontSize: '13px', marginTop: '8px' }}>Scroll halaman atau klik "Load Halaman" untuk memuat produk.</p>
                        </div>
                    ) : viewMode === 'table' ? (
                        /* Table View */
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '13px'
                        }}>
                            <thead>
                                <tr style={{
                                    borderBottom: `1px solid ${colors.border}`,
                                    background: '#f9fafb'
                                }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500', color: colors.textSecondary }}>#</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500', color: colors.textSecondary }}>Produk</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500', color: colors.textSecondary }}>Harga</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500', color: colors.textSecondary }}>Terjual</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500', color: colors.textSecondary }}>Rating</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '500', color: colors.textSecondary }}>Est. Omset</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedProducts.slice(0, 100).map((product, index) => (
                                    <tr
                                        key={product.itemid}
                                        onClick={() => openProductPage(product)}
                                        style={{
                                            borderBottom: `1px solid ${colors.border}`,
                                            background: isTopTen(index) ? colors.accentLight : (index % 2 === 0 ? 'white' : '#fafafa'),
                                            cursor: 'pointer',
                                            transition: 'background 0.15s ease'
                                        }}
                                    >
                                        <td style={{
                                            padding: '12px 16px',
                                            fontWeight: isTopTen(index) ? '600' : '400',
                                            color: isTopTen(index) ? colors.primary : colors.textSecondary
                                        }}>
                                            {index + 1}
                                        </td>
                                        <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                                            <div style={{
                                                fontWeight: '500',
                                                color: colors.textPrimary,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }} title={product.name}>
                                                {product.name}
                                            </div>
                                            {product.is_official_shop && (
                                                <span style={{
                                                    fontSize: '10px',
                                                    color: colors.success,
                                                    fontWeight: '500'
                                                }}>
                                                    Official Store
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: colors.textPrimary }}>
                                            {formatPrice(getPrice(product))}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: colors.textPrimary }}>
                                            {formatNumber(product.historical_sold || 0)}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: colors.textPrimary }}>
                                            {product.item_rating?.rating_star > 0
                                                ? product.item_rating.rating_star.toFixed(1)
                                                : "-"
                                            }
                                        </td>
                                        <td style={{
                                            padding: '12px 16px',
                                            textAlign: 'right',
                                            fontWeight: '600',
                                            color: colors.success
                                        }}>
                                            {formatPrice(getRevenue(product))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        /* Card View */
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                            gap: '16px',
                            padding: '20px'
                        }}>
                            {sortedProducts.slice(0, 60).map((product, index) => (
                                <div
                                    key={product.itemid}
                                    onClick={() => openProductPage(product)}
                                    style={{
                                        background: isTopTen(index) ? colors.accentLight : 'white',
                                        borderRadius: '8px',
                                        border: `1px solid ${isTopTen(index) ? colors.accentBorder : colors.border}`,
                                        overflow: 'hidden',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {/* Product Image */}
                                    <div style={{
                                        width: '100%',
                                        height: '180px',
                                        background: '#f3f4f6',
                                        position: 'relative'
                                    }}>
                                        {product.image && (
                                            <img
                                                src={`https://down-id.img.susercontent.com/file/${product.image}`}
                                                alt={product.name}
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover'
                                                }}
                                            />
                                        )}
                                        {/* Rank Badge */}
                                        <div style={{
                                            position: 'absolute',
                                            top: '8px',
                                            left: '8px',
                                            background: isTopTen(index) ? colors.primary : 'rgba(0,0,0,0.6)',
                                            color: 'white',
                                            fontSize: '11px',
                                            fontWeight: '600',
                                            padding: '4px 8px',
                                            borderRadius: '4px'
                                        }}>
                                            #{index + 1}
                                        </div>
                                        {/* Official Badge */}
                                        {product.is_official_shop && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '8px',
                                                right: '8px',
                                                background: colors.success,
                                                color: 'white',
                                                fontSize: '10px',
                                                fontWeight: '500',
                                                padding: '3px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                Official
                                            </div>
                                        )}
                                    </div>
                                    {/* Product Info */}
                                    <div style={{ padding: '14px' }}>
                                        <div style={{
                                            fontSize: '13px',
                                            fontWeight: '500',
                                            color: colors.textPrimary,
                                            marginBottom: '10px',
                                            height: '40px',
                                            overflow: 'hidden',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            lineHeight: '1.4'
                                        }}>
                                            {product.name}
                                        </div>
                                        <div style={{
                                            fontSize: '15px',
                                            fontWeight: '700',
                                            color: colors.primary,
                                            marginBottom: '10px'
                                        }}>
                                            {formatPrice(getPrice(product))}
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            fontSize: '12px',
                                            color: colors.textSecondary
                                        }}>
                                            <span>{product.item_rating?.rating_star?.toFixed(1) || '-'} rating</span>
                                            <span>{formatNumber(product.historical_sold || 0)} terjual</span>
                                        </div>
                                        <div style={{
                                            marginTop: '12px',
                                            paddingTop: '12px',
                                            borderTop: `1px solid ${colors.border}`,
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: colors.success
                                        }}>
                                            Est. Omset: {formatCurrency(getRevenue(product))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {products.length > (viewMode === 'table' ? 100 : 60) && (
                        <div style={{
                            padding: '16px 24px',
                            textAlign: 'center',
                            fontSize: '13px',
                            color: colors.textSecondary,
                            borderTop: `1px solid ${colors.border}`
                        }}>
                            Menampilkan {viewMode === 'table' ? 100 : 60} dari {products.length} produk. Download CSV untuk data lengkap.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// Main Component
const SearchStatsOverlay = () => {
    const [stats, setStats] = useState<SearchStats | null>(null)
    const [products, setProducts] = useState<SearchItem[]>([])
    const [keyword, setKeyword] = useState(getKeywordFromUrl())
    const [showModal, setShowModal] = useState(false)
    const [isScrolling, setIsScrolling] = useState(false)
    const [isLoaded, setIsLoaded] = useState(false)

    // Load existing data from storage on init
    useEffect(() => {
        const loadExisting = async () => {
            const currentKeyword = getKeywordFromUrl()
            if (!currentKeyword) return

            const cached = await loadSearchFromStorage(currentKeyword)
            if (cached) {
                setStats(cached.stats)
                setProducts(cached.products)
                setKeyword(currentKeyword)
            }
            setIsLoaded(true)
        }
        loadExisting()
    }, [])

    // Save to storage when products update (debounced)
    useEffect(() => {
        if (!isLoaded || products.length === 0) return

        // Debounce save to avoid too many writes
        const saveTimeout = setTimeout(() => {
            if (stats) {
                saveSearchToStorage(keyword, stats, products)
            }
        }, 1000) // Wait 1 second after last change

        return () => clearTimeout(saveTimeout)
    }, [products, stats, keyword, isLoaded])

    // Listen for search data from background script
    useEffect(() => {
        console.log("[SearchStats] Component mounted, requesting cached data...")

        // Request cached data from background (to solve race condition)
        chrome.runtime.sendMessage({ type: "GET_SEARCH_DATA" }, (response) => {
            if (response?.data?.items?.length > 0) {
                console.log("[SearchStats] Received cached data:", response.data.items.length, "items")
                // Trigger the same processing as live updates
                handleSearchData(response.data)
            } else {
                console.log("[SearchStats] No cached data available, waiting for API...")
            }
        })

        const handleSearchData = (data: any) => {
            const { items, totalCount } = data

            if (!items || items.length === 0) return

            // Merge new items with existing (avoid duplicates)
            setProducts(prev => {
                const existingIds = new Set(prev.map(p => p.itemid))
                const newItems = items.filter((item: SearchItem) => !existingIds.has(item.itemid))
                return [...prev, ...newItems]
            })

            // Calculate stats from ALL items (existing + new)
            setProducts(currentProducts => {
                // Recalculate stats based on merged products
                let totalSold = 0
                let totalRevenue = 0
                let totalRating = 0
                let ratingCount = 0
                let officialCount = 0

                currentProducts.forEach((item: SearchItem) => {
                    let price = item.price_min || item.price || 0
                    if (price > 1000000000) price = price / 100000

                    const sold = item.historical_sold || 0
                    totalSold += sold
                    totalRevenue += sold * price

                    if (item.item_rating?.rating_star) {
                        totalRating += item.item_rating.rating_star
                        ratingCount++
                    }

                    if (item.is_official_shop) officialCount++
                })

                const avgPrice = currentProducts.reduce((sum: number, item: SearchItem) => {
                    let price = item.price_min || item.price || 0
                    if (price > 1000000000) price = price / 100000
                    return sum + price
                }, 0) / (currentProducts.length || 1)

                setStats({
                    keyword: getKeywordFromUrl(),
                    totalProducts: totalCount,
                    sampleSize: currentProducts.length,
                    totalSold,
                    totalRevenue,
                    avgPrice,
                    avgRating: ratingCount > 0 ? totalRating / ratingCount : 0,
                    officialShopCount: officialCount,
                    officialShopPercent: Math.round(officialCount / (currentProducts.length || 1) * 100),
                    timestamp: Date.now()
                })
                setKeyword(getKeywordFromUrl())

                return currentProducts
            })
        }

        const handleMessage = (message: any) => {
            if (message.type === "SHOPEE_SEARCH_UPDATE" && message.data) {
                console.log("[SearchStats] Received live update:", message.data.items?.length, "items")
                handleSearchData(message.data)
            }
        }

        chrome.runtime.onMessage.addListener(handleMessage)
        return () => chrome.runtime.onMessage.removeListener(handleMessage)
    }, [])


    // Auto-scroll to load more
    const handleLoadMore = () => {
        if (isScrolling) {
            setIsScrolling(false)
            return
        }

        setIsScrolling(true)

        const scrollInterval = setInterval(() => {
            window.scrollBy(0, 500)

            // Check if reached bottom
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                clearInterval(scrollInterval)
                setIsScrolling(false)
            }
        }, 800)

        // Stop after 30 seconds
        setTimeout(() => {
            clearInterval(scrollInterval)
            setIsScrolling(false)
        }, 30000)
    }

    if (!stats) {
        return (
            <div className="datatoko-panel" style={{ marginTop: '12px', marginBottom: '12px' }}>
                <div className="datatoko-header">
                    <div className="datatoko-brand">
                        <div className="datatoko-logo">
                            <span className="datatoko-fab-icon">
                                <img src={iconUrl} alt="DataToko" />
                            </span>
                        </div>
                        <span className="datatoko-name">DataToko</span>
                        <span className="datatoko-badge">Keyword Research</span>
                    </div>
                    <div className="datatoko-meta">
                        <span className="datatoko-fetching">Menganalisis "{keyword}"...</span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <>
            <div className="datatoko-panel" style={{ marginTop: '12px', marginBottom: '12px' }}>
                {/* Header */}
                <div className="datatoko-header">
                    <div className="datatoko-brand">
                        <div className="datatoko-logo">
                            <span className="datatoko-fab-icon">
                                <img src={iconUrl} alt="DataToko" />
                            </span>
                        </div>
                        <span className="datatoko-name">DataToko</span>
                        <span className="datatoko-badge">Keyword Research</span>
                    </div>
                    <div className="datatoko-meta">
                        {isScrolling ? (
                            <span className="datatoko-fetching">
                                Auto-scroll {products.length}/{stats.totalProducts || '?'}...
                            </span>
                        ) : (
                            <span className="datatoko-captured">
                                {products.length}/{stats.totalProducts || '?'} produk
                            </span>
                        )}
                        {products.length < (stats.totalProducts || 999) && (
                            <button
                                className={isScrolling ? "datatoko-stop-btn" : "datatoko-load-btn"}
                                onClick={handleLoadMore}
                            >
                                {isScrolling ? "Stop" : "Load Halaman"}
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="datatoko-stats">
                    <div className="datatoko-stat">
                        <div className="datatoko-stat-value">{formatNumber(stats.totalProducts)}</div>
                        <div className="datatoko-stat-label">Total Produk</div>
                    </div>

                    <div className="datatoko-divider" />

                    <div className="datatoko-stat highlight">
                        <div className="datatoko-stat-value main">{formatNumber(stats.totalSold)}</div>
                        <div className="datatoko-stat-label">Est. Terjual*</div>
                    </div>

                    <div className="datatoko-divider" />

                    <div className="datatoko-stat highlight">
                        <div className="datatoko-stat-value main">{formatCurrency(stats.totalRevenue)}</div>
                        <div className="datatoko-stat-label">Est. Omset*</div>
                    </div>

                    <div className="datatoko-divider" />

                    <div className="datatoko-stat">
                        <div className="datatoko-stat-value">{formatCurrency(stats.avgPrice)}</div>
                        <div className="datatoko-stat-label">Harga Rata-rata</div>
                    </div>

                    <div className="datatoko-divider" />

                    <div className="datatoko-stat">
                        <div className="datatoko-stat-value rating">{stats.avgRating.toFixed(1)}</div>
                        <div className="datatoko-stat-label">Rating Rata-rata</div>
                    </div>

                    <div className="datatoko-divider" />

                    <div className="datatoko-stat">
                        <div className="datatoko-stat-value success">{stats.officialShopPercent}%</div>
                        <div className="datatoko-stat-label">Official Store</div>
                    </div>
                </div>

                {/* Disclaimer */}
                <div style={{
                    padding: '4px 16px',
                    fontSize: '10px',
                    color: '#9ca3af',
                    fontStyle: 'italic',
                    textAlign: 'center'
                }}>
                    *Berdasarkan {products.length} produk yang ter-capture
                </div>

                {/* Action Button */}
                <div className="datatoko-footer">
                    <button className="datatoko-analyze-btn" onClick={() => setShowModal(true)}>
                        Analisa Keyword
                    </button>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <SearchAnalysisModal
                    products={products}
                    keyword={keyword}
                    onClose={() => setShowModal(false)}
                />
            )}
        </>
    )
}

export default SearchStatsOverlay
