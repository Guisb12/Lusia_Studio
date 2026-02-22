"use client";

import React, { useCallback, useRef, useState } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ImageCropperDialogProps {
    open: boolean;
    onClose: () => void;
    /** data-URL of the selected image file */
    imageSrc: string;
    /** Fixed aspect ratio (e.g. 1 for square, 16/9). Omit for free crop. */
    aspect?: number;
    onCropComplete: (croppedBlob: Blob) => void;
}

function centerAspectCrop(w: number, h: number, aspect: number): Crop {
    return centerCrop(
        makeAspectCrop({ unit: "%", width: 90 }, aspect, w, h),
        w,
        h,
    );
}

async function getCroppedBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.width * scaleX);
    canvas.height = Math.round(crop.height * scaleY);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0, 0,
        canvas.width,
        canvas.height,
    );
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("Canvas is empty"))),
            "image/jpeg",
            0.92,
        );
    });
}

export function ImageCropperDialog({
    open,
    onClose,
    imageSrc,
    aspect,
    onCropComplete,
}: ImageCropperDialogProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const [applying, setApplying] = useState(false);

    const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const { width, height } = e.currentTarget;
        setCrop(
            aspect
                ? centerAspectCrop(width, height, aspect)
                : centerCrop({ unit: "%", width: 90, height: 90 }, width, height),
        );
    }, [aspect]);

    const handleConfirm = async () => {
        if (!imgRef.current || !completedCrop) return;
        setApplying(true);
        try {
            const blob = await getCroppedBlob(imgRef.current, completedCrop);
            onCropComplete(blob);
            onClose();
        } finally {
            setApplying(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
                {/* Header */}
                <div className="px-5 py-4 border-b border-brand-primary/8 shrink-0">
                    <DialogTitle className="text-base font-semibold text-brand-primary">
                        Recortar imagem
                    </DialogTitle>
                    <p className="text-xs text-brand-primary/40 mt-0.5">
                        Arrasta para selecionar a área a manter.
                    </p>
                </div>

                {/* Crop area */}
                <div className="flex items-center justify-center bg-brand-primary/3 overflow-auto"
                    style={{ minHeight: 280, maxHeight: "58vh" }}
                >
                    {imageSrc && (
                        <ReactCrop
                            crop={crop}
                            onChange={(c) => setCrop(c)}
                            onComplete={(c) => setCompletedCrop(c)}
                            aspect={aspect}
                            keepSelection
                            className="max-w-full"
                        >
                            <img
                                ref={imgRef}
                                src={imageSrc}
                                alt="Recortar"
                                onLoad={onImageLoad}
                                style={{ maxWidth: "100%", maxHeight: "56vh", objectFit: "contain" }}
                            />
                        </ReactCrop>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-brand-primary/8 flex items-center justify-end gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={onClose} disabled={applying}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleConfirm}
                        disabled={!completedCrop || applying}
                    >
                        {applying ? "A aplicar…" : "Aplicar recorte"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Helper hook — manages cropper open/close state and file reading. */
export function useImageCropper() {
    const [state, setState] = useState<{
        open: boolean;
        imageSrc: string;
        aspect?: number;
        onCrop: (blob: Blob) => void;
    }>({ open: false, imageSrc: "", onCrop: () => {} });

    const openCropper = useCallback((
        file: File,
        onCrop: (blob: Blob) => void,
        aspect?: number,
    ) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            setState({ open: true, imageSrc: e.target!.result as string, aspect, onCrop });
        };
        reader.readAsDataURL(file);
    }, []);

    const closeCropper = useCallback(() => {
        setState((prev) => ({ ...prev, open: false }));
    }, []);

    return { cropperState: state, openCropper, closeCropper };
}
