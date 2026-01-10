export interface Product {
    id: string;
    name: string;
    price: number;
    description: string;
}

export interface MerchantConfig {
    port: number;
    debug?: boolean;
}

export interface MerchantService {
    start(): void;
    stop(): void;
}
