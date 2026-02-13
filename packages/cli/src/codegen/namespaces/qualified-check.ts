/**
 * Determina si un elemento debe tener prefijo de namespace
 * Basado en el atributo elementFormDefault del schema
 */
export function shouldHavePrefix(elementObject: any): boolean {
    if (!elementObject || typeof elementObject !== 'object') return false;
    
    // Si el elemento tiene $qualified definido, usarlo
    if ('$qualified' in elementObject && typeof elementObject.$qualified === 'boolean') {
        return elementObject.$qualified;
    }
    
    // Si el elemento tiene un type que es objeto, verificar si tiene $qualified
    if ('type' in elementObject && typeof elementObject.type === 'object' && elementObject.type !== null) {
        const typeObj = elementObject.type;
        if ('$qualified' in typeObj && typeof typeObj.$qualified === 'boolean') {
            return typeObj.$qualified;
        }
    }
    
    // Por defecto, no agregar prefijo (unqualified)
    return false;
}
