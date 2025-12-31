import type { PlasmoCSConfig, PlasmoGetInlineAnchor } from "plasmo"
import { useEffect, useState } from "react"
import iconUrl from "data-base64:~/assets/icon.png"

import cssText from "data-text:~/contents/shopee-overlay.css"

export const config: PlasmoCSConfig = {
    matches: ["https://shopee.co.id/*-cat.*"],
    run_at: "document_end"
}

export const getStyle = () => {
    const style = document.createElement("style")
    style.textContent = cssText
    return style
}

export const getShadowHostId = () => "datatoko-category-stats"

// Inline anchor: place component above the Shopee Mall header
export const getInlineAnchor: PlasmoGetInlineAnchor = async () => {
    console.log("[CategoryStats] Looking for anchor element...")

    let attempts = 0
    const maxAttempts = 20

    while (attempts < maxAttempts) {
        const carouselHeader = document.querySelector(".ofs-carousel__header")
        if (carouselHeader) {
            console.log("[CategoryStats] Found .ofs-carousel__header")
            return { element: carouselHeader, insertPosition: "beforebegin" }
        }

        const carousel = document.querySelector(".ofs-carousel")
        if (carousel) {
            console.log("[CategoryStats] Found .ofs-carousel")
            return { element: carousel, insertPosition: "beforebegin" }
        }

        attempts++
        await new Promise(r => setTimeout(r, 500))
    }

    console.log("[CategoryStats] No anchor found, using body")
    return { element: document.body, insertPosition: "afterbegin" }
}

// Colors
const colors = {
    primary: '#1A352B',
    primaryHover: '#2d5a47',
    success: '#059669',
    textPrimary: '#1f2937',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
    accentLight: 'rgba(26, 53, 43, 0.05)',
    accentBorder: 'rgba(26, 53, 43, 0.15)'
}

interface CategoryProduct {
    itemid: number
    shopid: number
    name: string
    image?: string
    price: number
    historicalSold: number
    historicalSoldText?: string
    rating: number
    ratingCount?: number
    isOfficialShop: boolean
    isPreferredPlus: boolean
    shopName?: string
}

interface OfficialStore {
    shopid: number
    shopName: string
    shopLocation: string
    productCount: number
    totalSold: number
    avgRating: number
}

interface CategoryStats {
    totalProducts: number
    sampleSize: number
    totalSold: number
    totalRevenue: number
    avgPrice: number
    avgRating: number
    officialStoreCount: number
    officialShopPercent: number
}

// Format number
const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}JT`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}RB`
    return num.toLocaleString('id-ID')
}

// Format currency
const formatCurrency = (value: number): string => {
    if (value >= 1000000000) return `Rp ${(value / 1000000000).toFixed(1)}M`
    if (value >= 1000000) return `Rp ${(value / 1000000).toFixed(1)}JT`
    if (value >= 1000) return `Rp ${(value / 1000).toFixed(0)}RB`
    return `Rp ${value.toFixed(0)}`
}

// Format price
const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(price)
}

// Get category name from URL
const getCategoryFromUrl = (): string => {
    const path = window.location.pathname
    const match = path.match(/^\/([^-]+)-cat/)
    return match ? match[1].replace(/-/g, ' ') : 'Kategori'
}

// Analysis Modal Component
const CategoryAnalysisModal = ({
    products,
    officialStores,
    categoryName,
    onClose
}: {
    products: CategoryProduct[]
    officialStores: OfficialStore[]
    categoryName: string
    onClose: () => void
}) => {
    const [activeTab, setActiveTab] = useState<'products' | 'stores'>('products')
    const [viewMode, setViewMode] = useState<'table' | 'card'>('table')

    const getRevenue = (product: CategoryProduct) => {
        return (product.historicalSold || 0) * (product.price || 0)
    }

    const sortedProducts = [...products].sort((a, b) => getRevenue(b) - getRevenue(a))
    const sortedStores = [...officialStores].sort((a, b) => b.totalSold - a.totalSold)

    const isTopTen = (index: number) => index < 10

    const openProductPage = (product: CategoryProduct) => {
        if (product.shopid && product.itemid) {
            window.open(`https://shopee.co.id/product/${product.shopid}/${product.itemid}`, '_blank')
        }
    }

    const openStorePage = (store: OfficialStore) => {
        // Try to find a product from this store to get shop name for URL
        const shopProduct = products.find(p => p.shopid === store.shopid)
        if (shopProduct?.shopName) {
            window.open(`https://shopee.co.id/${shopProduct.shopName}`, '_blank')
        } else {
            window.open(`https://shopee.co.id/shop/${store.shopid}`, '_blank')
        }
    }

    const totalSold = products.reduce((sum, p) => sum + (p.historicalSold || 0), 0)
    const totalRevenue = products.reduce((sum, p) => sum + getRevenue(p), 0)
    const avgRating = products.length > 0
        ? products.reduce((sum, p) => sum + (p.rating || 0), 0) / products.length
        : 0

    const exportProductsToCSV = () => {
        const headers = ["No", "Nama Produk", "Harga", "Terjual", "Rating", "Est. Omset", "Official", "Item ID"]
        const rows = sortedProducts.map((p, i) => [
            i + 1,
            `"${(p.name || "").replace(/"/g, '""')}"`,
            p.price || 0,
            p.historicalSold || 0,
            p.rating?.toFixed(2) || 0,
            getRevenue(p),
            p.isOfficialShop ? "Yes" : "No",
            p.itemid
        ])

        const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n")
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `category_products_${categoryName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    const exportStoresToCSV = () => {
        const headers = ["No", "Nama Toko", "Lokasi", "Jumlah Produk", "Total Terjual", "Avg Rating", "Shop ID"]
        const rows = sortedStores.map((s, i) => [
            i + 1,
            `"${(s.shopName || "").replace(/"/g, '""')}"`,
            `"${(s.shopLocation || "").replace(/"/g, '""')}"`,
            s.productCount,
            s.totalSold,
            s.avgRating?.toFixed(2) || 0,
            s.shopid
        ])

        const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n")
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `category_stores_${categoryName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.csv`
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
                            Analisa Kategori: "{categoryName}"
                        </div>
                        <div style={{
                            fontSize: '13px',
                            color: colors.textSecondary,
                            marginTop: '4px'
                        }}>
                            {products.length} produk • {officialStores.length} official store • Est. Omset: {formatCurrency(totalRevenue)}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                            onClick={activeTab === 'products' ? exportProductsToCSV : exportStoresToCSV}
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

                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    borderBottom: `1px solid ${colors.border}`,
                    background: '#f9fafb'
                }}>
                    <button
                        onClick={() => setActiveTab('products')}
                        style={{
                            padding: '12px 24px',
                            fontSize: '13px',
                            fontWeight: '600',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: activeTab === 'products' ? colors.primary : colors.textSecondary,
                            borderBottom: activeTab === 'products' ? `2px solid ${colors.primary}` : '2px solid transparent',
                            marginBottom: '-1px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        Produk ({products.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('stores')}
                        style={{
                            padding: '12px 24px',
                            fontSize: '13px',
                            fontWeight: '600',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: activeTab === 'stores' ? colors.primary : colors.textSecondary,
                            borderBottom: activeTab === 'stores' ? `2px solid ${colors.primary}` : '2px solid transparent',
                            marginBottom: '-1px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        Official Store ({officialStores.length})
                    </button>

                    {/* View Mode Toggle - only for products */}
                    {activeTab === 'products' && (
                        <div style={{ marginLeft: 'auto', padding: '8px 16px', display: 'flex', alignItems: 'center' }}>
                            <div style={{
                                display: 'flex',
                                border: `1px solid ${colors.border}`,
                                borderRadius: '6px',
                                padding: '2px',
                                background: 'white'
                            }}>
                                <button
                                    onClick={() => setViewMode('table')}
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: '12px',
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
                                        padding: '4px 12px',
                                        fontSize: '12px',
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
                        </div>
                    )}
                </div>

                {/* Body */}
                <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
                    {activeTab === 'products' ? (
                        /* Products Tab */
                        <>
                            {products.length === 0 ? (
                                <div style={{
                                    padding: '60px 24px',
                                    textAlign: 'center',
                                    color: colors.textSecondary
                                }}>
                                    <p>Belum ada produk yang ter-capture.</p>
                                    <p style={{ fontSize: '13px', marginTop: '8px' }}>Scroll halaman untuk memuat lebih banyak produk.</p>
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
                                                    {product.isOfficialShop && (
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
                                                    {formatPrice(product.price)}
                                                </td>
                                                <td style={{ padding: '12px 16px', color: colors.textPrimary }}>
                                                    {formatNumber(product.historicalSold || 0)}
                                                </td>
                                                <td style={{ padding: '12px 16px', color: colors.textPrimary }}>
                                                    {product.rating > 0 ? product.rating.toFixed(1) : "-"}
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
                                                        src={product.image.startsWith('http') ? product.image : `https://down-id.img.susercontent.com/file/${product.image}`}
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
                                                {product.isOfficialShop && (
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
                                                    {formatPrice(product.price)}
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    fontSize: '12px',
                                                    color: colors.textSecondary
                                                }}>
                                                    <span>{product.rating?.toFixed(1) || '-'} rating</span>
                                                    <span>{formatNumber(product.historicalSold || 0)} terjual</span>
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
                        </>
                    ) : (
                        /* Official Stores Tab */
                        <>
                            {officialStores.length === 0 ? (
                                <div style={{
                                    padding: '60px 24px',
                                    textAlign: 'center',
                                    color: colors.textSecondary
                                }}>
                                    <p>Tidak ada Official Store dalam kategori ini.</p>
                                </div>
                            ) : (
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
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500', color: colors.textSecondary }}>Nama Toko</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500', color: colors.textSecondary }}>Lokasi</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '500', color: colors.textSecondary }}>Produk</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '500', color: colors.textSecondary }}>Terjual</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '500', color: colors.textSecondary }}>Avg Rating</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedStores.map((store, index) => (
                                            <tr
                                                key={store.shopid}
                                                onClick={() => openStorePage(store)}
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
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{
                                                        fontWeight: '500',
                                                        color: colors.textPrimary
                                                    }}>
                                                        {store.shopName || 'Official Store'}
                                                    </div>
                                                    <span style={{
                                                        fontSize: '10px',
                                                        color: colors.success,
                                                        fontWeight: '500'
                                                    }}>
                                                        Official Store
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', color: colors.textSecondary }}>
                                                    {store.shopLocation || 'Indonesia'}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', color: colors.textPrimary, fontWeight: '500' }}>
                                                    {store.productCount}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', color: colors.success, fontWeight: '600' }}>
                                                    {formatNumber(store.totalSold)}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', color: colors.textPrimary }}>
                                                    {store.avgRating > 0 ? store.avgRating.toFixed(1) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}


// Main Component
function CategoryStatsOverlay() {
    const [products, setProducts] = useState<CategoryProduct[]>([])
    const [officialStores, setOfficialStores] = useState<OfficialStore[]>([])
    const [stats, setStats] = useState<CategoryStats | null>(null)
    const [totalCount, setTotalCount] = useState(0)

    const [showModal, setShowModal] = useState(false)
    const categoryName = getCategoryFromUrl()

    // Calculate stats from products
    const calculateStats = (items: CategoryProduct[], total: number): CategoryStats => {
        if (items.length === 0) return {
            totalProducts: 0,
            sampleSize: 0,
            totalSold: 0,
            totalRevenue: 0,
            avgPrice: 0,
            avgRating: 0,
            officialStoreCount: 0,
            officialShopPercent: 0
        }

        const prices = items.map(p => p.price).filter(p => p > 0)
        const ratings = items.map(p => p.rating).filter(r => r > 0)
        const totalSold = items.reduce((sum, p) => sum + p.historicalSold, 0)
        const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
        const officialCount = items.filter(p => p.isOfficialShop).length

        return {
            totalProducts: total || items.length,
            sampleSize: items.length,
            totalSold: totalSold,
            totalRevenue: totalSold * avgPrice,
            avgPrice: avgPrice,
            avgRating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
            officialStoreCount: officialCount,
            officialShopPercent: items.length > 0 ? Math.round((officialCount / items.length) * 100) : 0
        }
    }

    // Process incoming data
    const processData = (data: any) => {
        const newProducts = data.products || []
        const newStores = data.officialStores || []
        const total = data.totalCount || 0

        setProducts(prev => {
            const existing = new Map(prev.map(p => [p.itemid, p]))
            newProducts.forEach((p: CategoryProduct) => existing.set(p.itemid, p))
            return Array.from(existing.values())
        })

        setOfficialStores(prev => {
            const existing = new Map(prev.map(s => [s.shopid, s]))
            newStores.forEach((s: OfficialStore) => {
                const existingStore = existing.get(s.shopid)
                if (existingStore) {
                    existingStore.productCount = Math.max(existingStore.productCount, s.productCount)
                    existingStore.totalSold = Math.max(existingStore.totalSold, s.totalSold)
                } else {
                    existing.set(s.shopid, s)
                }
            })
            return Array.from(existing.values()).sort((a, b) => b.productCount - a.productCount)
        })

        setTotalCount(total)
    }

    // Request cached data on mount AND listen for updates
    useEffect(() => {
        console.log("[CategoryStats] Component mounted, requesting cached data...")

        // Request cached data from background
        chrome.runtime.sendMessage({ type: "GET_CATEGORY_DATA" }, (response) => {
            if (response?.data) {
                console.log("[CategoryStats] Received cached data:", response.data.products?.length, "products")
                processData(response.data)
            } else {
                console.log("[CategoryStats] No cached data available, waiting for API...")
            }
        })

        // Also listen for new updates
        const handleMessage = (message: any) => {
            if (message.type === "SHOPEE_CATEGORY_UPDATE") {
                console.log("[CategoryStats] Received live update:", message.data.products?.length, "products")
                processData(message.data)
            }
        }

        chrome.runtime.onMessage.addListener(handleMessage)
        return () => chrome.runtime.onMessage.removeListener(handleMessage)
    }, [])

    // Update stats when products change
    useEffect(() => {
        if (products.length > 0) {
            setStats(calculateStats(products, totalCount))
        }
    }, [products, totalCount])

    // Loading state
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
                        <span className="datatoko-badge">Category Research</span>
                    </div>
                    <div className="datatoko-meta">
                        <span className="datatoko-fetching">Menganalisis "{categoryName}"...</span>
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
                        <span className="datatoko-badge">Category Research</span>
                    </div>
                    <div className="datatoko-meta">
                        <span className="datatoko-captured">
                            {products.length}/{stats.totalProducts || '?'} produk
                        </span>
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
                        Analisa Kategori
                    </button>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <CategoryAnalysisModal
                    products={products}
                    officialStores={officialStores}
                    categoryName={categoryName}
                    onClose={() => setShowModal(false)}
                />
            )}
        </>
    )
}

export default CategoryStatsOverlay

