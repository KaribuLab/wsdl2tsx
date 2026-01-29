/**
 * Verifica si un tipo está referenciado en algún lugar del objeto de tipo
 */
export function isTypeReferenced(typeName: string, typeObject: any, allComplexTypes: any, visited: Set<string> = new Set()): boolean {
    if (visited.has(typeName)) return false;
    visited.add(typeName);
    
    const typeLocalName = typeName.split(':').pop()!;
    
    // Buscar en todas las propiedades del objeto
    for (const [key, value] of Object.entries(typeObject)) {
        if (key === '$namespace' || key === '$base') continue;
        
        if (typeof value === 'object' && value !== null) {
            // Si tiene una propiedad type que es un string, verificar si coincide
            if ('type' in value && typeof value.type === 'string') {
                const referencedType = value.type;
                // Comparar por nombre completo o por nombre local
                if (referencedType === typeName || 
                    referencedType.endsWith(':' + typeLocalName) ||
                    referencedType.split(':').pop() === typeLocalName) {
                    return true;
                }
                // Si el tipo referenciado está en complexTypes, buscar recursivamente dentro de él
                const fullReferencedType = Object.keys(allComplexTypes).find(k => 
                    k === referencedType || 
                    k.endsWith(':' + referencedType.split(':').pop()) ||
                    k.split(':').pop() === referencedType.split(':').pop()
                );
                if (fullReferencedType && allComplexTypes[fullReferencedType]) {
                    if (isTypeReferenced(typeName, allComplexTypes[fullReferencedType], allComplexTypes, visited)) {
                        return true;
                    }
                }
            } else if ('type' in value && typeof value.type === 'object') {
                // Tipo complejo anidado (objeto completo), verificar si es el mismo tipo
                // Comparar estructura o buscar recursivamente
                if (isTypeReferenced(typeName, value.type, allComplexTypes, visited)) {
                    return true;
                }
                // También verificar si este objeto anidado coincide con el tipo buscado
                // comparando las claves principales
                if (value.type && typeof value.type === 'object') {
                    const nestedKeys = Object.keys(value.type).filter((k: string) => k !== '$namespace' && k !== '$base');
                    const typeDef = allComplexTypes[typeName];
                    if (typeDef && typeof typeDef === 'object') {
                        const typeKeys = Object.keys(typeDef).filter((k: string) => k !== '$namespace' && k !== '$base');
                        if (nestedKeys.length > 0 && nestedKeys.every((k: string) => typeKeys.includes(k))) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    
    return false;
}

/**
 * Función recursiva para encontrar todos los tipos referenciados
 */
export function findReferencedTypes(obj: any, allComplexTypes: any, found: Set<string> = new Set(), depth: number = 0): Set<string> {
    for (const [key, value] of Object.entries(obj)) {
        if (key === '$namespace' || key === '$base') continue;
        
        if (typeof value === 'object' && value !== null && 'type' in value) {
            const typeValue = (value as any).type;
            if (typeof typeValue === 'string') {
                // Buscar si este tipo está en allComplexTypes
                const matchingType = Object.keys(allComplexTypes).find(k => 
                    k === typeValue || 
                    k.endsWith(':' + typeValue.split(':').pop()) ||
                    k.split(':').pop() === typeValue.split(':').pop()
                );
                if (matchingType && !found.has(matchingType)) {
                    found.add(matchingType);
                    // Buscar recursivamente dentro del tipo encontrado
                    if (allComplexTypes[matchingType]) {
                        findReferencedTypes(allComplexTypes[matchingType], allComplexTypes, found, depth + 1);
                    }
                } else if (matchingType && found.has(matchingType)) {
                }
            } else if (typeof typeValue === 'object' && typeValue !== null) {
                // Tipo complejo anidado, buscar recursivamente
                findReferencedTypes(typeValue, allComplexTypes, found, depth + 1);
            }
        }
    }
    return found;
}
