import { useState } from "react"
import type { ProductData } from "~contents/shopee-store"

interface Props {
    products: ProductData[]
    shopName: string
    shopId?: number
    onClose: () => void
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

export const StoreAnalysisModal = ({ products, shopName, shopId, onClose }: Props) => {
    const [viewMode, setViewMode] = useState<'table' | 'card'>('table')

    // Calculate estimated revenue for a product
    const getRevenue = (product: ProductData) => {
        return (product.historical_sold || 0) * (product.price || 0)
    }

    // Sort products by revenue (highest first)
    const sortedProducts = [...products].sort((a, b) => getRevenue(b) - getRevenue(a))

    // Check if product is in top 10
    const isTopTen = (index: number) => index < 10

    // Open product detail page
    const openProductPage = (product: ProductData) => {
        const productShopId = product.shopid || shopId
        if (productShopId && product.itemid) {
            window.open(`https://shopee.co.id/product/${productShopId}/${product.itemid}`, '_blank')
        }
    }

    // Export to CSV
    const exportToCSV = () => {
        const headers = [
            "No",
            "Nama Produk",
            "Harga",
            "Harga Asli",
            "Diskon %",
            "Terjual (Total)",
            "Terjual/Bulan",
            "Stock",
            "Rating",
            "Jumlah Rating",
            "Disukai",
            "Komentar",
            "Est. Omset",
            "Brand",
            "Item ID"
        ]

        const rows = sortedProducts.map((p, i) => {
            return [
                i + 1,
                `"${(p.name || "").replace(/"/g, '""')}"`,
                p.price || 0,
                p.original_price || p.price || 0,
                p.discount || 0,
                p.historical_sold || 0,
                p.monthly_sold || 0,
                p.stock || 0,
                p.rating_star?.toFixed(2) || 0,
                p.rating_count || 0,
                p.liked_count || 0,
                p.comment_count || 0,
                getRevenue(p),
                `"${(p.brand || "").replace(/"/g, '""')}"`,
                p.itemid
            ]
        })

        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.join(","))
        ].join("\n")

        // Create and download file
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `${shopName.replace(/[^a-z0-9]/gi, "_")}_products_${new Date().toISOString().split("T")[0]}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    // Calculate totals
    const totalSold = products.reduce((sum, p) => sum + (p.historical_sold || 0), 0)
    const totalRevenue = products.reduce((sum, p) => sum + getRevenue(p), 0)
    const avgRating = products.length > 0
        ? products.reduce((sum, p) => sum + (p.rating_star || 0), 0) / products.length
        : 0

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
                            Analisa Produk - {shopName}
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
                            <p style={{ fontSize: '13px', marginTop: '8px' }}>Scroll halaman toko untuk memuat produk.</p>
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
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500', color: colors.textSecondary }}>/Bulan</th>
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
                                            {product.discount > 0 && (
                                                <span style={{
                                                    fontSize: '10px',
                                                    color: colors.success,
                                                    fontWeight: '500'
                                                }}>
                                                    -{product.discount}% OFF
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: colors.textPrimary }}>
                                            {formatPrice(product.price)}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: colors.textPrimary }}>
                                            {product.historical_sold_text || formatNumber(product.historical_sold || 0)}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: colors.textPrimary }}>
                                            {product.monthly_sold_text || (product.monthly_sold > 0 ? formatNumber(product.monthly_sold) : "-")}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: colors.textPrimary }}>
                                            {product.rating_star > 0
                                                ? product.rating_star.toFixed(1)
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
                                        {/* Discount Badge */}
                                        {product.discount > 0 && (
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
                                                -{product.discount}%
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
                                            <span>{product.rating_star?.toFixed(1) || '-'} rating</span>
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
