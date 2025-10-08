// src/pages/chat/SmartImage.tsx
import React, {useEffect, useMemo, useState} from 'react'

type Props = {
    src: string,
    alt?: string,
    className?: string,
    title?: string,
    mimeHint?: string | null,
    loading?: string
}

const isLikelyHeic = (url: string, hint?: string | null) => {
    const h = (hint || '').toLowerCase()
    if (h.includes('image/heic') || h.includes('image/heif')) return true
    const u = (url || '').toLowerCase()
    return u.endsWith('.heic') || u.endsWith('.heif')
}

export default function SmartImage({src, alt, className, title, mimeHint, loading}: Props) {
    const [displaySrc, setDisplaySrc] = useState(src)
    const [triedConvert, setTriedConvert] = useState(false)
    const heicish = useMemo(() => isLikelyHeic(src, mimeHint || undefined), [src, mimeHint])

    useEffect(() => {
        setDisplaySrc(src)
        setTriedConvert(false)
    }, [src])

    const onError = async () => {
        // HEIC가 의심되고 아직 변환을 안 해봤다면 시도
        if (heicish && !triedConvert) {
            setTriedConvert(true)
            try {
                // heic2any 동적 import (약 20KB 지연 로드)
                const heic2any = (await import('heic2any')).default as unknown as
                    (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | File>;
                // 이미지 바이너리 fetch → blob 변환
                const res = await fetch(src, {credentials: 'omit'})
                if (!res.ok) throw new Error('fetch failed')
                const blob = await res.blob()
                // HEIC → JPEG(WebP 가능): 품질 0.9
                const outBlob = await heic2any({blob, toType: 'image/jpeg', quality: 0.9})
                const url = URL.createObjectURL(outBlob as Blob)
                setDisplaySrc(url)
                return
            } catch (e) {
                // 변환 실패 시 그대로 둠 (alt 텍스트라도 보이게)
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
            loading="lazy"
            onError={onError}
        />
    )
}
