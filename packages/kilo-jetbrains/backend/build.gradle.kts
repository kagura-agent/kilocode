import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.gradle.api.DefaultTask
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.ListProperty
import org.gradle.api.tasks.CacheableTask
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction
import org.openapitools.generator.gradle.plugin.tasks.GenerateTask

@CacheableTask
abstract class WriteOpenapiSpec : DefaultTask() {
    @get:InputFile
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val inputFile: RegularFileProperty

    @get:OutputFile
    abstract val outputFile: RegularFileProperty

    @get:Input
    abstract val routes: ListProperty<String>

    @TaskAction
    fun run() {
        val root = JsonSlurper().parse(inputFile.get().asFile) as Map<*, *>
        val all = root["paths"] as Map<*, *>
        val filtered = routes.get().associateWith { path ->
            normalize(all[path]) ?: throw GradleException("OpenAPI path not found: $path")
        }
        val next = linkedMapOf<String, Any?>(
            "openapi" to root["openapi"],
            "info" to root["info"],
            "servers" to listOf(mapOf("url" to "http://127.0.0.1")),
            "paths" to filtered,
        )
        val file = outputFile.get().asFile
        file.parentFile.mkdirs()
        file.writeText(JsonOutput.prettyPrint(JsonOutput.toJson(next)) + "\n")
    }

    private fun normalize(node: Any?): Any? {
        if (node is Map<*, *>) {
            return node.entries
                .filter { it.key != "const" }
                .associate { it.key.toString() to normalize(it.value) }
        }
        if (node is List<*>) {
            return node.map(::normalize)
        }
        return node
    }
}

plugins {
    alias(libs.plugins.rpc)
    alias(libs.plugins.kotlin)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.openapi.generator)
}

kotlin {
    jvmToolchain(21)
}

val openapiDir = layout.buildDirectory.dir("generated/openapi")
val openapiSrc = openapiDir.map { it.dir("src/main/kotlin") }
val openapiSpec = layout.buildDirectory.file("tmp/openapi/openapi.json")

sourceSets {
    main {
        resources.srcDir(layout.buildDirectory.dir("generated/cli"))
        kotlin.srcDir(openapiSrc)
    }
}

val cliDir = layout.buildDirectory.dir("generated/cli/cli")
val spec = rootProject.layout.projectDirectory.file("../sdk/openapi.json")
val apiRoutes = listOf("/global/health")
val production = providers.gradleProperty("production").map { it.toBoolean() }.orElse(false)

val requiredPlatforms = listOf(
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
    "windows-x64",
    "windows-arm64",
)

val checkCli by tasks.registering {
    description = "Verify CLI binaries exist before building"
    val dir = cliDir.map { it.asFile }
    val prod = production.get()
    val platforms = requiredPlatforms.toList()
    doLast {
        val resolved = dir.get()
        if (!resolved.exists() || resolved.listFiles()?.isEmpty() != false) {
            throw GradleException(
                "CLI binaries not found at ${resolved.absolutePath}.\n" +
                "Run 'bun run build' from packages/kilo-jetbrains/ to build CLI and plugin together."
            )
        }
        if (prod) {
            val missing = platforms.filter { platform ->
                val dir = File(resolved, platform)
                val exe = if (platform.startsWith("windows")) "kilo.exe" else "kilo"
                !File(dir, exe).exists()
            }
            if (missing.isNotEmpty()) {
                throw GradleException(
                    "Production build requires all platform CLI binaries.\n" +
                    "Missing: ${missing.joinToString(", ")}\n" +
                    "Run 'bun run build:production' to build all platforms."
                )
            }
        }
    }
}

val writeOpenapiSpec by tasks.registering(WriteOpenapiSpec::class) {
    description = "Write filtered OpenAPI spec for backend client"
    inputFile.set(spec)
    outputFile.set(openapiSpec)
    routes.set(apiRoutes)
}

tasks.named<GenerateTask>("openApiGenerate") {
    generatorName.set("kotlin")
    dependsOn(writeOpenapiSpec)
    inputSpec.set(openapiSpec.map { it.asFile.absolutePath })
    outputDir.set(openapiDir.map { it.asFile.absolutePath })
    packageName.set("ai.kilocode.client")
    apiPackage.set("ai.kilocode.client.api")
    modelPackage.set("ai.kilocode.client.model")
    invokerPackage.set("ai.kilocode.client.core")
    cleanupOutput.set(true)
    globalProperties.set(
        mapOf(
            "apiDocs" to "false",
            "apiTests" to "false",
            "modelDocs" to "false",
            "modelTests" to "false",
        )
    )
    configOptions.set(
        mapOf(
            "library" to "jvm-okhttp4",
            "serializationLibrary" to "kotlinx_serialization",
            "dateLibrary" to "java8",
            "sourceFolder" to "src/main/kotlin",
            "omitGradleWrapper" to "true",
            "omitGradlePluginVersions" to "true",
            "useSettingsGradle" to "false",
            "enumPropertyNaming" to "original",
        )
    )
}

tasks.processResources {
    dependsOn(checkCli)
}

tasks.compileKotlin {
    dependsOn(tasks.named("openApiGenerate"))
}

dependencies {
    intellijPlatform {
        intellijIdea(libs.versions.intellij.platform)
        bundledModule("intellij.platform.kernel.backend")
        bundledModule("intellij.platform.rpc.backend")
        bundledModule("intellij.platform.backend")
    }

    implementation(project(":shared"))
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.okhttp.sse)
}
