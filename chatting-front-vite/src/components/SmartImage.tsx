// src/pages/chat/SmartImage.tsx
import React, { useEffect, useMemo, useState } from 'react'

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
    src: string
    mimeHint?: string | null
}

const isLikelyHeic = (url: string, hint?: string | null) => {
    const h = (hint || '').toLowerCase()
    if (h.includes('image/heic') || h.includes('image/heif')) return true
    const u = (url || '').toLowerCase()
    return u.endsWith('.heic') || u.endsWith('.heif')
}

export default function SmartImage({
                                       src,
                                       alt,
                                       className,
                                       title,
                                       mimeHint,
                                       loading = 'lazy',     // 기본값 유지
                                       onLoad,               // ✅ 표준 onLoad 받기
                                       ...rest               // ✅ 나머지 <img> 속성 패스스루
                                   }: ImgProps) {
    const [displaySrc, setDisplaySrc] = useState(src)
    const [triedConvert, setTriedConvert] = useState(false)
    const [blobUrl, setBlobUrl] = useState<string | null>(null)
    const heicish = useMemo(() => isLikelyHeic(src, mimeHint || undefined), [src, mimeHint])

    // src 변경 시 초기화
    useEffect(() => {
        setDisplaySrc(src)
        setTriedConvert(false)
    }, [src])

    // blob URL 정리
    useEffect(() => {
        return () => {
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl)
            }
        }
    }, [blobUrl])

    const onError = async () => {
        if (heicish && !triedConvert) {
            setTriedConvert(true)
            try {
                const heic2any = (await import('heic2any')).default as unknown as
                    (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | File>
                const res = await fetch(src, { credentials: 'omit' })
                if (!res.ok) throw new Error('fetch failed')
                const inBlob = await res.blob()
                const outBlob = await heic2any({ blob: inBlob, toType: 'image/jpeg', quality: 0.9 })
                const url = URL.createObjectURL(outBlob as Blob)
                setBlobUrl(url)
                setDisplaySrc(url)
            } catch (e) {
                console.warn('[SmartImage] HEIC convert failed', e)
            }
        }
    }

    return (
        <img
            src={displaySrc}
            alt={alt || ''}
            className={className}
            title={title}
            loading={loading}   // ✅ 전달된 loading 사용
            onLoad={onLoad}     // ✅ onLoad 패스스루
            onError={onError}
            {...rest}           // ✅ width/height/decoding 등 추가 속성 전파
        />
    )
}
