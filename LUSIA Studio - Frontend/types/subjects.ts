export type Subject = {
    id: string;
    name: string;
    slug: string | null;
    color: string | null;
    icon: string | null;
    education_level: string;
    grade_levels: string[] | null;
    is_custom: boolean;
};
