import Handlebars, { type TemplateDelegate } from "handlebars";
import fs from "fs";
import path from "path";
import { registerHandlebarsHelpers } from "../template-helpers.js";

// Ruta al template Handlebars
// En el build, los templates se copian a dist/templates
// __dirname está disponible en CommonJS (el build genera CJS)
const TEMPLATE_PATH = path.join(__dirname || process.cwd(), "templates", "component.hbs");

// Cache para el template compilado
let compiledTemplate: TemplateDelegate | null = null;
let templateSource: string | null = null;

/**
 * Compila el template Handlebars y genera el código del componente
 */
export function compileTemplate(templateData: any): string {
    // Registrar helpers de Handlebars (solo una vez)
    registerHandlebarsHelpers();
    
    // Leer y cachear el template
    if (!templateSource) {
        templateSource = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    }
    
    // Cachear el template compilado
    if (!compiledTemplate) {
        compiledTemplate = Handlebars.compile(templateSource);
    }
    
    // Compilar el template con los datos
    return compiledTemplate(templateData);
}
